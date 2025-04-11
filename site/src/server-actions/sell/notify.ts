"use server";
import "../../../envConfig";
import { Errors, MyError } from "@/constants/errors";
import { NotifySend } from "@/constants/types";
import axios, { AxiosError } from "axios";
// import { m } from "motion/react";

export async function sendNotification(args: NotifySend) {
  try {
    if (
      !process.env.NOTIFIER_NUMBER ||
      !process.env.WHATSAPP_TOKEN ||
      !process.env.WHATSAPP_PHONE_ID
    ) {
      console.log(
        "Set NOTIFIER_NUMBER, WHATSAPP_PHONE_ID and WHATSAPP_TOKEN in env variables",
      );
      throw new MyError(Errors.INVALID_SETUP);
    }
    console.log(`[${Date.now()}] Sending notification`);
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: process.env.NOTIFIER_NUMBER,
        type: "template",
        template: {
          name: "notification",
          language: {
            code: "en",
          },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: args.customer_phone_number },
                { type: "text", text: args.amount },
              ],
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        },
      },
    );

    console.log(response.data);
  } catch (err) {
    if (err instanceof AxiosError) {
      console.log(err.response?.data);
    }
    console.log("Error sending notification", err);
  } finally {
    console.log(`[${Date.now()}] notify function finshed running`);
  }
}
