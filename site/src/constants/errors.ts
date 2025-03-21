export class MyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "MyError";
    }
}

export enum Errors {
    INVALID_SETUP="Set up environment variables correctly",
    NOT_CREATE_STOCK = "Could not create stock",
    NOT_CREATE_STOCK_DB = "Could not create stock in DB",
    NOT_CREATE_STOCK_TOKEN = "Could not create stock token",
    INVALID_SYMBOL = "Stock symbol must be a string of at most 9 characters",
    INVALID_NAME = "Stock name must be a string",
    INVALID_STOCK_ID = "Stock id must be a string",
    NOT_GET_STOCKS = "Could not get stocks",
    NOT_GET_STOCKS_DB = "Could not get stocks from db",
    NOT_GET_STOCK_PRICES = "Could not get stock prices",
    NOT_GET_SAFARICOM_TOKEN = "Could not get access token from safaricom",
    INVALID_AMOUNT = "Amount must be greater than 0 and whole",
    INVALID_PHONE_NUMBER = "Phone number is invalid",
    NOT_SEND_STK_PUSH = "Could not send STK Push"
}