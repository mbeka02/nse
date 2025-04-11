"use server";

import { Errors, MyError } from "@/constants/errors";
import database from "@/db";
import { getStockPrices } from "./getStocks";
import { PaymentStatus } from "@/constants/status";

export async function getTotalPortfolioValue(
  user_address: string,
): Promise<number> {
  try {
    // Get prices of all stocks
    const priceStocks = await getStockPrices();

    // Get stocks of a user
    const userStocks = await database.getStocksOwnedByUser(user_address);

    // Multiply and sum price
    let value = 0;
    if (userStocks) {
      for (const s of userStocks.stocks) {
        for (const price of priceStocks) {
          if (s.symbol === price.symbol) {
            value += s.number_stocks * price.price;
          }
        }
      }
    }

    return value;
  } catch (err) {
    console.log("Error getting total portfolio value", err);
    if (err instanceof MyError) {
      throw err;
    }
    throw new MyError(Errors.UNKNOWN);
  }
}

interface StocksList {
  num: number;
  price: number;
  symbol: string;
}

interface InitialInvestmentArgs {
  user_address: string;
  symbol?: string;
  date?: Date;
}

export async function getInitialInvestment(
  args: InitialInvestmentArgs,
): Promise<number> {
  try {
    // Get all stock transactions
    const transactions = await database.getStockPurchases(
      args.user_address,
      PaymentStatus.PAID,
    );
    const finalStockList: StocksList[] = [];

    // Process each transaction
    for (const trans of transactions) {
      if (args.date) {
        if (trans.purchase_date > args.date) {
          break;
        }
      }

      // If a buy transaction insert in final stock list
      if (trans.transaction_type === "buy") {
        finalStockList.push({
          num: trans.amount_shares,
          price: trans.buy_price / trans.amount_shares,
          symbol: trans.stock_symbol,
        });
      }

      if (trans.transaction_type === "sell") {
        // Remove stock from oldest stock list record
        removeStock(
          { num: trans.amount_shares, symbol: trans.stock_symbol },
          finalStockList,
        );
      }
    }

    let initialInvestment = 0;
    for (const stock of finalStockList) {
      if (args.symbol) {
        if (stock.symbol === args.symbol) {
          initialInvestment += stock.num * stock.price;
        }
      } else {
        initialInvestment += stock.num * stock.price;
      }
    }

    return initialInvestment;
  } catch (err) {
    console.log("Error getting initial investment", err);
    if (err instanceof MyError) {
      throw err;
    }

    throw new MyError(Errors.UNKNOWN);
  }
}

function removeStock(
  args: { num: number; symbol: string },
  stocks: StocksList[],
) {
  try {
    if (stocks.length <= 0) {
      throw new MyError(Errors.MUST_STOCKS_SELL);
    }

    while (args.num > 0) {
      if (stocks.length < 1) {
        throw new MyError(Errors.TOO_MANY_SELL);
      }
      const oldest = stocks.find((f) => f.symbol === args.symbol);

      if (oldest) {
        const oldestIndex = stocks.indexOf(oldest);
        if (oldest.num > args.num) {
          oldest.num = oldest.num - args.num;
          break;
        } else if (oldest.num === args.num) {
          stocks.splice(oldestIndex, 1);
          break;
        } else {
          args.num = args.num - oldest.num;
          stocks.splice(oldestIndex, 1);
        }
      } else {
        throw new MyError(Errors.TOO_MANY_SELL);
      }
    }
  } catch (err) {
    console.log("Error removing items", err);
    throw err;
  }
}

interface StockHoldings {
  tokenId: string;
  symbol: string;
  name: string;
  shares: number;
  buy_price: number;
  current_price: number;
  profit: number;
}

export async function getStockHoldings(
  user_address: string,
): Promise<StockHoldings[]> {
  try {
    // Get amount of stocks owned by user
    const stockHoldings: StockHoldings[] = [];
    const ownedStocks = await database.getStocksOwnedByUser(user_address);
    const stockPrices = await getStockPrices();

    if (ownedStocks) {
      // For each stock get buy price and current price
      for (const stock of ownedStocks.stocks) {
        // Getting current price
        const price = stockPrices.find((f) => f.symbol === stock.symbol);
        if (price === undefined) {
          throw new MyError(Errors.NOT_GET_STOCK_PRICES);
        }
        const currentprice = price.price;

        // Getting buy price
        const buyingPrice = await getInitialInvestment({
          user_address,
          symbol: stock.symbol,
        });

        // Getting profit
        // const profit = (buyingPrice / stock.number_stocks - currentprice) / buyingPrice * 100;
        const profit = (currentprice - (buyingPrice / stock.number_stocks)) / (buyingPrice / stock.number_stocks) * 100
        if (stock.number_stocks > 0) {
          stockHoldings.push({
            tokenId: stock.tokenId,
            shares: stock.number_stocks,
            symbol: stock.symbol,
            buy_price: buyingPrice / stock.number_stocks,
            name: stock.name,
            current_price: currentprice,
            profit,
          });
        }
      }

      return stockHoldings;
    } else {
      return [];
    }
  } catch (err) {
    console.log("Error getting stock holdings", err);
    if (err instanceof MyError) {
      throw err;
    }

    throw new MyError(Errors.UNKNOWN);
  }
}