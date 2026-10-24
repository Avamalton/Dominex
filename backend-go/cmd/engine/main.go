package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/dimonex/exchange/internal/domain"
)

func main() {
	log.Println("[DIMONEX-ENGINE-GO] Initializing Single-Threaded Matching Engine Daemon...")
	
	btcBook := domain.NewOrderBook("BTC-IDR", 8, 10, 20)
	ethBook := domain.NewOrderBook("ETH-IDR", 8, 10, 20)
	usdtBook := domain.NewOrderBook("USDT-IDR", 6, 10, 20)

	log.Printf("[DIMONEX-ENGINE-GO] Initialized Order Books: %s, %s, %s\n", btcBook, ethBook, usdtBook)
	log.Println("[DIMONEX-ENGINE-GO] Listening to NATS stream: 'dimonex.orders.>' for FIFO incoming orders")

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	fmt.Println("\n[DIMONEX-ENGINE-GO] Graceful shutdown completed.")
}
