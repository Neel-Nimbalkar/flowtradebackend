# Telegram Notifications Setup Guide

## Overview
FlowGrid Trading now supports automated Telegram notifications for trading signals. When your strategies generate BUY or SELL signals, you'll receive instant notifications on Telegram with all the important details.

## Setup Steps

### 1. Create a Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Start a chat and send `/newbot`
3. Follow the prompts:
   - Give your bot a name (e.g., "FlowGrid Trading Bot")
   - Give your bot a username (must end in 'bot', e.g., "flowgrid_trading_bot")
4. BotFather will give you a **Bot Token** - save this! It looks like:
   ```
   123456789:ABCdefGHIjklMNOpqrsTUVwxyz-1234567890
   ```

### 2. Get Your Chat ID

1. Search for `@userinfobot` on Telegram
2. Start a chat with it
3. Send any message
4. The bot will reply with your user info, including your **Chat ID** (a number like `123456789`)
5. Save this Chat ID

### 3. Configure in FlowGrid

1. Open FlowGrid Trading in your browser
2. Navigate to **Account & Settings** from the sidebar
3. Scroll down to the **Telegram Notifications** section
4. Enter your **Bot Token** and **Chat ID**
5. Click **Save**
6. Click **Send Test** to verify the connection

If successful, you'll receive a test message on Telegram! 🎉

## What Gets Sent

When your strategy generates a signal, you'll receive a message with:
- **Signal Type**: BUY, SELL, or HOLD
- **Strategy Name**: The name of your saved strategy
- **Symbol**: The trading ticker (e.g., SPY, AAPL)
- **Current Price**: The price at signal generation
- **Timeframe**: Chart timeframe used
- **Additional Info**: RSI, MACD, EMA, Volume (if available)
- **Timestamp**: When the signal was generated

### Example Message:
```
🟢 TRADING SIGNAL

Strategy: SPY Momentum Strategy
Signal: BUY
Symbol: SPY
Timeframe: 1Hour
Price: $450.25
Confidence: 85.5%

Additional Info:
  • RSI: 68.5
  • MACD: 2.34
  • Volume: 15000000

Time: 2025-12-04 15:30:00
```

## Troubleshooting

### Test Message Fails
- **Check Bot Token**: Make sure it's copied exactly from BotFather
- **Check Chat ID**: Verify your Chat ID from @userinfobot
- **Start the Bot**: You must start a conversation with your bot first
  - Search for your bot by username
  - Click "Start" to initiate the chat

### Not Receiving Notifications
- Verify your settings are saved (check the green checkmark)
- Make sure your strategy is running (toggle ON in Dashboard)
- Check that signals are being generated (BUY/SELL, not just HOLD)
- Ensure backend is running on port 5000

### Privacy & Security
- Your Bot Token and Chat ID are stored locally in your browser and in a local file
- No data is sent to third parties
- Only you can access your bot's messages
- Telegram messages are encrypted in transit

## Advanced: Python Module

The Telegram notification system is built on the `telegram_notifier.py` module. You can use it directly in your own scripts:

```python
from telegram_notifier import TelegramNotifier

notifier = TelegramNotifier(
    bot_token="YOUR_BOT_TOKEN",
    chat_id="YOUR_CHAT_ID"
)

# Send a trading signal
notifier.send_signal(
    strategy_name="My Strategy",
    signal="BUY",
    symbol="SPY",
    price=450.25,
    timeframe="1H",
    additional_info={"rsi": 68.5}
)
```

## Need Help?

If you encounter issues:
1. Check the browser console for errors (F12 → Console tab)
2. Check the backend terminal for error messages
3. Verify your bot token and chat ID are correct
4. Try the Test button in settings

Happy Trading! 📈
