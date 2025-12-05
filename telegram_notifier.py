"""
Telegram Notification Service for FlowGrid Trading Signals
Sends trading signals to users via Telegram bot
"""

import requests
import json
import os
from typing import Optional, Dict, Any
from datetime import datetime


class TelegramNotifier:
    def __init__(self, bot_token: Optional[str] = None, chat_id: Optional[str] = None):
        """
        Initialize Telegram notifier
        
        Args:
            bot_token: Telegram bot token from @BotFather
            chat_id: User's Telegram chat ID
        """
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.base_url = f"https://api.telegram.org/bot{bot_token}" if bot_token else None
        
    def set_credentials(self, bot_token: str, chat_id: str):
        """Update bot token and chat ID"""
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.base_url = f"https://api.telegram.org/bot{bot_token}"
    
    def is_configured(self) -> bool:
        """Check if Telegram is properly configured"""
        return bool(self.bot_token and self.chat_id and self.base_url)
    
    def test_connection(self) -> Dict[str, Any]:
        """
        Test Telegram bot connection
        
        Returns:
            dict: Status and message
        """
        if not self.is_configured():
            return {
                "success": False,
                "error": "Telegram bot token and chat ID not configured"
            }
        
        try:
            response = requests.get(
                f"{self.base_url}/getMe",
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get('ok'):
                    bot_info = data.get('result', {})
                    return {
                        "success": True,
                        "bot_name": bot_info.get('first_name'),
                        "bot_username": bot_info.get('username')
                    }
            
            return {
                "success": False,
                "error": f"Failed to connect: {response.text}"
            }
        
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": f"Connection error: {str(e)}"
            }
    
    def send_message(self, text: str, parse_mode: str = "HTML") -> Dict[str, Any]:
        """
        Send a message via Telegram
        
        Args:
            text: Message text (supports HTML or Markdown)
            parse_mode: "HTML" or "Markdown"
        
        Returns:
            dict: Status and response
        """
        if not self.is_configured():
            return {
                "success": False,
                "error": "Telegram not configured"
            }
        
        try:
            payload = {
                "chat_id": self.chat_id,
                "text": text,
                "parse_mode": parse_mode
            }
            
            response = requests.post(
                f"{self.base_url}/sendMessage",
                json=payload,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get('ok'):
                    return {
                        "success": True,
                        "message_id": data.get('result', {}).get('message_id')
                    }
            
            return {
                "success": False,
                "error": f"Failed to send: {response.text}"
            }
        
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": f"Send error: {str(e)}"
            }
    
    def format_signal_message(
        self,
        strategy_name: str,
        signal: str,
        symbol: str,
        price: Optional[float],
        timeframe: str = "",
        confidence: Optional[float] = None,
        additional_info: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Format a trading signal message for Telegram
        
        Args:
            strategy_name: Name of the strategy
            signal: BUY, SELL, or HOLD
            symbol: Trading symbol
            price: Current price
            timeframe: Chart timeframe
            confidence: Signal confidence (0-100)
            additional_info: Extra data to include
        
        Returns:
            str: Formatted HTML message
        """
        # Determine emoji based on signal
        emoji_map = {
            "BUY": "🟢",
            "LONG": "🟢",
            "SELL": "🔴",
            "SHORT": "🔴",
            "HOLD": "🟡",
            "REJECTED": "⚪"
        }
        
        signal_upper = signal.upper()
        emoji = emoji_map.get(signal_upper, "📊")
        
        # Build message with new format
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        message_parts = [
            f"{emoji} <b>TRADING SIGNAL</b>",
            "",
            f"<b>Strategy:</b> {strategy_name}",
            f"<b>Signal:</b> {signal_upper}",
            f"<b>Symbol:</b> {symbol}",
            f"<b>Timeframe:</b> {timeframe if timeframe else 'N/A'}",
            f"<b>Price:</b> ${price:.2f}" if price is not None else "<b>Price:</b> N/A"
        ]
        
        # Add additional info if provided
        if additional_info:
            message_parts.append("")
            message_parts.append("<b>Additional Info:</b>")
            for key, value in additional_info.items():
                if value is not None:
                    # Format key nicely (e.g., "rsi_value" -> "RSI Value")
                    formatted_key = key.replace('_', ' ').upper()
                    
                    # Format value
                    if isinstance(value, float):
                        formatted_value = f"{value:.2f}"
                    else:
                        formatted_value = str(value)
                    
                    message_parts.append(f"- {formatted_key}: {formatted_value}")
        
        message_parts.append("")
        message_parts.append(f"<b>Time:</b> {timestamp}")
        
        return "\n".join(message_parts)
    
    def send_signal(
        self,
        strategy_name: str,
        signal: str,
        symbol: str,
        price: Optional[float] = None,
        timeframe: str = "",
        confidence: Optional[float] = None,
        additional_info: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Send a formatted trading signal to Telegram
        
        Returns:
            dict: Status and response
        """
        message = self.format_signal_message(
            strategy_name=strategy_name,
            signal=signal,
            symbol=symbol,
            price=price,
            timeframe=timeframe,
            confidence=confidence,
            additional_info=additional_info
        )
        
        return self.send_message(message, parse_mode="HTML")


# Singleton instance for the application
_notifier_instance = None


def get_notifier() -> TelegramNotifier:
    """Get or create the singleton notifier instance"""
    global _notifier_instance
    if _notifier_instance is None:
        _notifier_instance = TelegramNotifier()
    return _notifier_instance


def load_telegram_settings() -> Dict[str, str]:
    """
    Load Telegram settings from localStorage-like file
    
    Returns:
        dict: bot_token and chat_id
    """
    settings_file = "telegram_settings.json"
    
    if os.path.exists(settings_file):
        try:
            with open(settings_file, 'r') as f:
                settings = json.load(f)
                return {
                    "bot_token": settings.get("bot_token", ""),
                    "chat_id": settings.get("chat_id", "")
                }
        except Exception as e:
            print(f"Error loading Telegram settings: {e}")
    
    return {"bot_token": "", "chat_id": ""}


def save_telegram_settings(bot_token: str, chat_id: str) -> bool:
    """
    Save Telegram settings to file
    
    Returns:
        bool: Success status
    """
    settings_file = "telegram_settings.json"
    
    try:
        settings = {
            "bot_token": bot_token,
            "chat_id": chat_id,
            "updated_at": datetime.now().isoformat()
        }
        
        with open(settings_file, 'w') as f:
            json.dump(settings, f, indent=2)
        
        # Update the singleton instance
        notifier = get_notifier()
        notifier.set_credentials(bot_token, chat_id)
        
        return True
    
    except Exception as e:
        print(f"Error saving Telegram settings: {e}")
        return False


if __name__ == "__main__":
    # Test the notifier
    print("Telegram Notifier Test")
    print("=" * 50)
    
    # Example usage
    notifier = TelegramNotifier(
        bot_token="YOUR_BOT_TOKEN",
        chat_id="YOUR_CHAT_ID"
    )
    
    # Test formatting
    message = notifier.format_signal_message(
        strategy_name="SPY Momentum Strategy",
        signal="BUY",
        symbol="SPY",
        price=450.25,
        timeframe="1H",
        confidence=85.5,
        additional_info={
            "rsi": 68.5,
            "macd": 2.34,
            "volume_ratio": 1.5
        }
    )
    
    print("\nFormatted Message:")
    print(message)
