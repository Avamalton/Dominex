// Package domain provides zero-float financial domain types and order matching logic for Go production engine.
package domain

import (
	"fmt"
	"math/big"
	"sync"
	"time"

	"github.com/google/uuid"
)

type Side string
const (
	Buy  Side = "BUY"
	Sell Side = "SELL"
)

type TimeInForce string
const (
	GTC TimeInForce = "GTC"
	IOC TimeInForce = "IOC"
)

type Order struct {
	ID             uuid.UUID
	UserID         uuid.UUID
	PairID         string
	Side           Side
	Price          *big.Int // Price in integer quote currency units (sen)
	Quantity       *big.Int // Quantity in base currency units (satoshis)
	FilledQuantity *big.Int
	TimeInForce    TimeInForce
	CreatedAt      time.Time
}

type Trade struct {
	ID           uuid.UUID
	PairID       string
	MakerOrderID uuid.UUID
	TakerOrderID uuid.UUID
	Price        *big.Int
	Quantity     *big.Int
	QuoteVolume  *big.Int
	MakerFee     *big.Int
	TakerFee     *big.Int
	CreatedAt    time.Time
}

// OrderBook manages single-threaded price-time priority matching per pair.
type OrderBook struct {
	mu           sync.Mutex
	PairID       string
	BaseDecimals int64
	MakerFeeBps  int64
	TakerFeeBps  int64
	Bids         []*Order
	Asks         []*Order
}

func NewOrderBook(pairID string, baseDecimals int64, makerBps int64, takerBps int64) *OrderBook {
	return &OrderBook{
		PairID:       pairID,
		BaseDecimals: baseDecimals,
		MakerFeeBps:  makerBps,
		TakerFeeBps:  takerBps,
		Bids:         make([]*Order, 0),
		Asks:         make([]*Order, 0),
	}
}

// ProcessOrder matches a taker order against book with Self-Trade Prevention (STP).
func (ob *OrderBook) ProcessOrder(taker *Order) ([]*Trade, error) {
	ob.mu.Lock()
	defer ob.mu.Unlock()

	trades := make([]*Trade, 0)
	isBuy := taker.Side == Buy
	remQty := new(big.Int).Sub(taker.Quantity, taker.FilledQuantity)

	var bookSide *[]*Order
	if isBuy {
		bookSide = &ob.Asks
	} else {
		bookSide = &ob.Bids
	}

	scale := new(big.Int).Exp(big.NewInt(10), big.NewInt(ob.BaseDecimals), nil)
	idx := 0

	for idx < len(*bookSide) && remQty.Sign() > 0 {
		maker := (*bookSide)[idx]

		// Price matching condition
		if isBuy && taker.Price.Cmp(maker.Price) < 0 {
			break
		}
		if !isBuy && taker.Price.Cmp(maker.Price) > 0 {
			break
		}

		// Self-Trade Prevention (STP)
		if maker.UserID == taker.UserID {
			// Cancel Maker to avoid wash trade
			*bookSide = append((*bookSide)[:idx], (*bookSide)[idx+1:]...)
			continue
		}

		// Match quantity
		makerRem := new(big.Int).Sub(maker.Quantity, maker.FilledQuantity)
		matchQty := new(big.Int)
		if remQty.Cmp(makerRem) < 0 {
			matchQty.Set(remQty)
		} else {
			matchQty.Set(makerRem)
		}

		// Quote volume: (matchQty * maker.Price) / scale
		product := new(big.Int).Mul(matchQty, maker.Price)
		quoteVol := new(big.Int).Div(product, scale)

		// Fees in basis points
		makerFee := new(big.Int).Div(new(big.Int).Mul(quoteVol, big.NewInt(ob.MakerFeeBps)), big.NewInt(10000))
		takerFee := new(big.Int).Div(new(big.Int).Mul(quoteVol, big.NewInt(ob.TakerFeeBps)), big.NewInt(10000))

		trade := &Trade{
			ID:           uuid.New(),
			PairID:       ob.PairID,
			MakerOrderID: maker.ID,
			TakerOrderID: taker.ID,
			Price:        new(big.Int).Set(maker.Price),
			Quantity:     matchQty,
			QuoteVolume:  quoteVol,
			MakerFee:     makerFee,
			TakerFee:     takerFee,
			CreatedAt:    time.Now(),
		}
		trades = append(trades, trade)

		maker.FilledQuantity.Add(maker.FilledQuantity, matchQty)
		taker.FilledQuantity.Add(taker.FilledQuantity, matchQty)
		remQty.Sub(remQty, matchQty)

		if maker.FilledQuantity.Cmp(maker.Quantity) == 0 {
			*bookSide = append((*bookSide)[:idx], (*bookSide)[idx+1:]...)
		} else {
			idx++
		}
	}

	// Insert leftover GTC order
	if remQty.Sign() > 0 && taker.TimeInForce == GTC {
		ob.insertOrder(taker)
	}

	return trades, nil
}

func (ob *OrderBook) insertOrder(order *Order) {
	if order.Side == Buy {
		for i, o := range ob.Bids {
			if order.Price.Cmp(o.Price) > 0 {
				ob.Bids = append(ob.Bids[:i], append([]*Order{order}, ob.Bids[i:]...)...)
				return
			}
		}
		ob.Bids = append(ob.Bids, order)
	} else {
		for i, o := range ob.Asks {
			if order.Price.Cmp(o.Price) < 0 {
				ob.Asks = append(ob.Asks[:i], append([]*Order{order}, ob.Asks[i:]...)...)
				return
			}
		}
		ob.Asks = append(ob.Asks, order)
	}
}

func (ob *OrderBook) String() string {
	return fmt.Sprintf("OrderBook[%s Bids=%d Asks=%d]", ob.PairID, len(ob.Bids), len(ob.Asks))
}
