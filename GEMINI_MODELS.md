# 🤖 Gemini Model Availability & Rate Limits

This document summarizes the available models and their respective rate limits for the configured Gemini API key, as of **January 25, 2026**.

## 📊 Rate Limits by Model

| Model Name | Category | RPM (Req/Min) | TPM (Tokens/Min) | RPD (Req/Day) |
|:---|:---|:---:|:---:|:---:|
| `gemini-2.5-flash-lite` | Text-out models | 10 | 250K | 20 |
| `gemini-2.5-flash-tts` | Multi-modal generative models | 3 | 10K | 10 |
| `gemini-2.5-flash` | Text-out models | 5 | 250K | 20 |
| `gemini-3-flash` | Text-out models | 5 | 250K | 20 |
| `gemini-robotics-er-1.5-preview` | Other models | 10 | 250K | 20 |
| `gemma-3-12b` | Other models | 30 | 15K | 14.4K |
| `gemma-3-1b` | Other models | 30 | 15K | 14.4K |
| `gemma-3-27b` | Other models | 30 | 15K | 14.4K |
| `gemma-3-2b` | Other models | 30 | 15K | 14.4K |
| `gemma-3-4b` | Other models | 30 | 15K | 14.4K |
| `gemini-embedding-1.0` | Other models | 100 | 30K | 1K |
| `gemini-2.5-flash-native-audio-dialog` | Live API | Unlimited | 1M | Unlimited |

---

## 📸 Dashboard Reference
![Gemini Rate Limits](file:///C:/Users/brani/.gemini/antigravity/brain/82ae232a-4472-4022-bf6a-62a1a5ed632b/uploaded_media_1769296143361.png)

> [!TIP]
> **Gemini 2.5 Flash Lite** remains the most generous for experimental usage with 10 RPM, while **Gemini 3 Flash** and **Gemini 2.5 Flash** are balanced for higher complexity.
