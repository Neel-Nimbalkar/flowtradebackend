#!/usr/bin/env python3
"""
Lightweight verification script to find any remaining references to Yahoo/yfinance in the repo
Usage: python scripts/verify_no_yahoo.py

This intentionally skips the virtualenv directory `.venv` and common binary folders.
"""
import os
import fnmatch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
EXCLUDE_DIRS = {'.venv', '__pycache__', 'node_modules', 'dist', 'build', 'outputs'}
PATTERNS = ['*yahoo*', '*YAHOO*', '*yfinance*', '*Yahoo*', '*yahoo_fin*']

matches = []
for dirpath, dirnames, filenames in os.walk(ROOT):
    # Skip excluded folders
    parts = set(dirpath.split(os.sep))
    if parts & EXCLUDE_DIRS:
        continue
    for fname in filenames:
        # check file content for patterns
        fpath = os.path.join(dirpath, fname)
        try:
            with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                txt = f.read()
                for pat in PATTERNS:
                    if pat.lower().strip('*') in txt.lower():
                        matches.append((fpath, pat))
                        break
        except Exception:
            # ignore binary files or unreadable files
            continue

if not matches:
    print('✅ No matches for Yahoo/yfinance found in repo (excluding .venv and common build dirs).')
else:
    print('⚠️ Found potential references to Yahoo/yfinance:')
    for p, pat in matches:
        print('-', p)
    print('\nPlease inspect the listed files and update them to use Alpaca data sources instead.')
