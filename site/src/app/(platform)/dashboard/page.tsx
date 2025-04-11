"use client";
import React, { useState, useEffect } from "react";
import getGraphData from "@/server-actions/dashboard/graph";
import { sendNotification } from "@/server-actions/sell/notify";
import { Loader2 } from "lucide-react";
import { GraphDataMode } from "@/constants/types";
import { Button } from "@/components/ui/button";
import {
  HWBridgeSigner,
  HederaSignerType,
} from "@buidlerlabs/hashgraph-react-wallets";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Wallet,
  BarChart3,
  DollarSign,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import {
  getStockHoldings,
  getTotalPortfolioValue,
  getInitialInvestment,
} from "@/server-actions/stocks/dashboard";
import { useAccountId, useWallet } from "@buidlerlabs/hashgraph-react-wallets";
import { TransferTransaction } from "@hashgraph/sdk";
import { transferHbar } from "@/server-actions/contracts/transfer_hbar";
import updateUserStockHoldings from "@/server-actions/stocks/update_stock_holdings";
interface StockHoldings {
  tokenId: string;
  symbol: string;
  name: string;
  shares: number;
  buy_price: number;
  current_price: number;
  profit: number;
}

interface PerformanceData {
  date: Date;
  value: number;
  name?: string;
}

type DateRange = "1w" | "1m";
function isHederaSigner(signer: HWBridgeSigner): signer is HederaSignerType {
  // Check based on properties that are unique to HederaSignerType
  return (signer as HederaSignerType).topic !== undefined;
}
const DashBoardPage = () => {
  const { isConnected } = useWallet();
  const { data: address } = useAccountId();
  const [isSelling, setIsSelling] = useState(false);
  const [portfolio, setPortfolio] = useState<StockHoldings[]>([]);
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([]);
  const [totalInvested, setTotalInvested] = useState(0);
  const [currentValue, setCurrentValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStock, setSelectedStock] = useState<StockHoldings | null>(
    null,
  );
  const [sellQuantity, setSellQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("mobile");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("1w");
  const { signer } = useWallet();
  const { data: accountId } = useAccountId();

  useEffect(() => {
    // Only proceed if wallet is connected and we have an address
    if (isConnected && address /*&& status === "connected"*/) {
      const fetchData = async () => {
        try {
          setLoading(true);
          setError(null);

          const fromDate = getDateFromRange(dateRange);
          let mode: GraphDataMode = GraphDataMode.WEEKLY;

          // Adjust mode based on date range
          if (dateRange === "1w" || dateRange === "1m") {
            mode = GraphDataMode.WEEKLY;
          } else {
            mode = GraphDataMode.MONTHLY;
          }

          console.log("user address", address);
          const [holdings, invested, portfolioValue, performance] =
            await Promise.all([
              getStockHoldings(address),
              getInitialInvestment({ user_address: address }),
              getTotalPortfolioValue(address),
              getGraphData({
                user_address: address,
                from: fromDate,
                to: new Date(),
                mode: mode,
              }),
            ]);

          setPortfolio(holdings);
          setTotalInvested(invested);
          setCurrentValue(portfolioValue);

          setPerformanceData(
            performance.map((item) => ({
              ...item,
              name: formatDateForDisplay(item.date, dateRange),
            })),
          );
        } catch (err) {
          console.error("Fetch error:", err);
          setError("Failed to load portfolio data");
        } finally {
          setLoading(false);
        }
      };

      fetchData();
    }
  }, [isConnected, address, dateRange /*status, isInitialConnectionCheck*/]);

  const getDateFromRange = (range: DateRange): Date => {
    const date = new Date();
    switch (range) {
      case "1w":
        date.setDate(date.getDate() - 7);
        break;
      case "1m":
        date.setMonth(date.getMonth() - 1);
        break;
    }
    return date;
  };

  const formatDateForDisplay = (date: Date, range: DateRange) => {
    if (range === "1w" || range === "1m") {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  };

  const totalProfit = currentValue - totalInvested;
  const profitPercentage =
    totalInvested !== 0 ? (totalProfit / totalInvested) * 100 : 0;

  const handleSell = async () => {
    if (!selectedStock || !address) {
      toast.warning("No stock selected or wallet disconnected");
      return;
    }
    setIsSelling(true);

    try {
      // Implement sell logic here
      const currentPricePerShare =
        selectedStock.current_price / selectedStock.shares;
      const saleAmount = currentPricePerShare * sellQuantity;
      await sellToken(sellQuantity, selectedStock.tokenId);
      // Send notification
      if (paymentMethod === "mobile") {
        console.log("Mobile payment selected");
        await sendNotification({
          customer_phone_number: phoneNumber,
          amount: saleAmount,
        });
        console.log("Payment done");
      } else {
        console.log("HBAR option selected");
        await transferHbar({
          userAddress: address,
          amount: saleAmount,
        });
        console.log("HBAR sent");
      }
      console.log("Beginning to update stock holdings");
      await updateUserStockHoldings({
        user_address: address,
        stock_symbol: selectedStock.symbol,
        stock_name: selectedStock.name,
        number_stock: sellQuantity,
        tokenId: selectedStock.tokenId,
        operation: "sell",
      });
      console.log("Updated holdings");
      toast.success(
        `Sold ${sellQuantity} shares of ${selectedStock.symbol} for KSH ${saleAmount.toLocaleString(
          "en-KE",
          {
            minimumFractionDigits: 2,
          },
        )}`,
      );

      // Refresh data
      const [holdings, invested, portfolioValue] = await Promise.all([
        getStockHoldings(address),
        getInitialInvestment({ user_address: address }),
        getTotalPortfolioValue(address),
      ]);

      setPortfolio(holdings);
      setTotalInvested(invested);
      setCurrentValue(portfolioValue);
    } catch (err) {
      toast.error("Failed to complete sale");
      console.error("Sale error:", err);
    } finally {
      setIsSelling(false);
    }
  };
  const sellToken = async (amount: number, tokenId: string) => {
    const object = {
      tokenId: tokenId,
      amount: amount,
    };
    if (!signer) {
      toast.error("Wallet not connected");
      return;
    }
    if (!accountId) {
      toast.error("Account ID not found");
      return;
    }
    if (!isHederaSigner(signer)) {
      toast.error("Invalid signer");
      return;
    }
    const transferTokenTx = new TransferTransaction()
      .addTokenTransfer(object.tokenId, accountId, -amount) //Fill in the token ID
      .addTokenTransfer(object.tokenId, "0.0.5785413", amount); //Fill in the token ID and receiver account
    
    console.log("Signing transfer of coinst transaction");
    const signedTx = await transferTokenTx.freezeWithSigner(signer);
    await signedTx.executeWithSigner(signer);
    console.log("Done signing");
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Wallet className="h-12 w-12 mb-4 text-gray-400" />
        <h2 className="text-xl font-bold mb-2">Wallet Not Connected</h2>
        <p className="text-gray-500 mb-4">
          Please connect your wallet to view your portfolio
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-4"></div>
        <p>Just a moment...</p>
        {address && (
          <p className="text-sm text-gray-500 mt-2">
            Wallet: {address.substring(0, 6)}...
            {address.substring(address.length - 4)}
          </p>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
        <div className="bg-red-50 p-4 rounded-lg max-w-md text-center">g
          <h2 className="text-red-600 font-bold mb-2">Error Loading Data</h2>
          <p className="text-red-500 mb-4">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 lg:px-16 mx-auto mb-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold mt-6">Your Dashboard</h1>
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-gray-500" />
          <span className="text-sm bg-gray-100 px-3 py-1 rounded-full">
            {address
              ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
              : "Disconnected"}
          </span>
        </div>
        {/*
        <Button variant="outline" onClick={() => sellToken()}>
          Sell
        </Button>
      */}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total Portfolio Value
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              KSH{" "}
              {currentValue.toLocaleString("en-KE", {
                minimumFractionDigits: 2,
              })}
            </div>
            <p
              className={`text-xs ${profitPercentage >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {profitPercentage >= 0 ? (
                <ArrowUp className="inline h-3 w-3" />
              ) : (
                <ArrowDown className="inline h-3 w-3" />
              )}
              {Math.abs(profitPercentage).toFixed(2)}% from total investment
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total Profit/Loss
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {totalProfit >= 0 ? "+" : ""}KSH{" "}
              {totalProfit.toLocaleString("en-KE", {
                minimumFractionDigits: 2,
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              From initial investment of KSH{" "}
              {totalInvested.toLocaleString("en-KE", {
                minimumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Assets Owned</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{portfolio.length}</div>
            <p className="text-xs text-muted-foreground">
              Total of {portfolio.reduce((acc, stock) => acc + stock.shares, 0)}{" "}
              shares
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Portfolio Performance</CardTitle>
          <CardDescription>
            Your portfolio value over time (KSH)
          </CardDescription>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(["1w", "1m"] as DateRange[]).map((range) => (
                <Button
                  key={range}
                  variant={dateRange === range ? "default" : "outline"}
                  size="sm"
                  onClick={() => setDateRange(range)}
                >
                  {range.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip
                  formatter={(value) => [
                    `KSH ${value.toLocaleString()}`,
                    "Value",
                  ]}
                  labelFormatter={(label) => `Month: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#8884d8"
                  strokeWidth={2}
                  dot={{ strokeWidth: 2 }}
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Asset Holdings</CardTitle>
          <CardDescription>
            Manage your portfolio and sell assets when ready
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Avg Buy Price</TableHead>
                <TableHead className="text-right">Current Price</TableHead>
                <TableHead className="text-right">Profit/Loss</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {portfolio.map((stock) => {
                if (stock.shares === 0) {
                  return null;
                }
                const buyPricePerShare = stock.buy_price;
                const currentPricePerShare = stock.current_price;
                const profitPercent = stock.profit;

                return (
                  <TableRow key={stock.symbol}>
                    <TableCell className="font-medium">
                      {stock.symbol}
                    </TableCell>
                    <TableCell>{stock.name}</TableCell>
                    <TableCell className="text-right">{stock.shares}</TableCell>
                    <TableCell className="text-right">
                      {buyPricePerShare.toLocaleString("en-KE", {
                        minimumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      {currentPricePerShare.toLocaleString("en-KE", {
                        minimumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell
                      className={`text-right ${stock.profit >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {stock.profit >= 0 ? (
                        <ArrowUp className="inline h-4 w-4 mr-1" />
                      ) : (
                        <ArrowDown className="inline h-4 w-4 mr-1" />
                      )}
                      {Math.abs(profitPercent).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedStock(stock);
                              setSellQuantity(1);
                            }}
                          >
                            Sell
                          </Button>
                        </DialogTrigger>
                        {selectedStock?.symbol === stock.symbol && (
                          <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle>
                                Sell {selectedStock.symbol}
                              </DialogTitle>
                              <DialogDescription>
                                {selectedStock.name} - Current Price: KSH{" "}
                                {currentPricePerShare.toLocaleString("en-KE", {
                                  minimumFractionDigits: 2,
                                })}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                              <div className="grid gap-2">
                                <label className="text-sm font-medium">
                                  Quantity to Sell (Max: {selectedStock.shares})
                                </label>
                                <Input
                                  type="number"
                                  min="1"
                                  max={selectedStock.shares}
                                  value={sellQuantity}
                                  onChange={(e) =>
                                    setSellQuantity(
                                      Math.min(
                                        parseInt(e.target.value) || 1,
                                        selectedStock.shares,
                                      ),
                                    )
                                  }
                                />
                              </div>
                              <div className="grid gap-2">
                                <label className="text-sm font-medium">
                                  Total Amount to Receive
                                </label>
                                <div className="text-xl font-bold">
                                  KSH{" "}
                                  {(
                                    currentPricePerShare * sellQuantity
                                  ).toLocaleString("en-KE", {
                                    minimumFractionDigits: 2,
                                  })}
                                </div>
                              </div>
                              <div className="grid gap-2">
                                <label className="text-sm font-medium">
                                  Payment Method
                                </label>
                                <div className="flex space-x-2">
                                  <Button
                                    variant={
                                      paymentMethod === "mobile"
                                        ? "default"
                                        : "outline"
                                    }
                                    onClick={() => setPaymentMethod("mobile")}
                                    className="flex-1"
                                  >
                                    Mobile Money
                                  </Button>
                                  <Button
                                    variant={
                                      paymentMethod === "eth"
                                        ? "default"
                                        : "outline"
                                    }
                                    onClick={() => setPaymentMethod("eth")}
                                    className="flex-1"
                                  >
                                    HBAR
                                  </Button>
                                </div>
                              </div>
                              {paymentMethod === "mobile" && (
                                <div className="grid gap-2">
                                  <label className="text-sm font-medium">
                                    Phone Number
                                  </label>
                                  <Input
                                    placeholder="+254..."
                                    value={phoneNumber}
                                    onChange={(e) =>
                                      setPhoneNumber(e.target.value)
                                    }
                                  />
                                </div>
                              )}
                            </div>
                            <DialogFooter>
                              <Button onClick={handleSell} disabled={isSelling}>
                                {isSelling ? (
                                  <div className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Processing...
                                  </div>
                                ) : (
                                  "Confirm Sale"
                                )}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        )}
                      </Dialog>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashBoardPage;
