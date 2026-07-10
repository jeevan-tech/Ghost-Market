# Deployment Guide: Google Cloud Run

This guide explains how to deploy **Ghost Market** (both the Next.js frontend and Python/Playwright engine) to **Google Cloud Run** using the packaged Dockerfile.

## Prerequisites
1. Install the [Google Cloud SDK (gcloud CLI)](https://cloud.google.com/sdk/docs/install).
2. Authenticate and configure your project:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```
3. Enable the required Google APIs (Cloud Run & Artifact Registry):
   ```bash
   gcloud services enable run.googleapis.com artifactregistry.googleapis.com
   ```

---

## 🚀 Easy Deploy (GCloud Build)

Google Cloud Run can build and deploy the container in a single command using Google Cloud Build (no local Docker required):

```bash
gcloud run deploy ghost-market \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="GEMINI_API_KEY=YOUR_API_KEY,DEMO_MODE=true"
```

*Note: Replace `YOUR_API_KEY` with your Google Gemini API Key.*

---

## 🛠 Advanced: Running the Real Playwright Swarm in the Cloud

By default, the deployed instance will run in **TypeScript Demo Mode** to prevent long-running browser instances from timing out or hitting cold start limits.

If you want the deployed app to run the **actual Playwright browser agents** in Google Cloud:

1. Deploy the service with `DEMO_MODE=false`:
   ```bash
   gcloud run deploy ghost-market \
     --source . \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars="GEMINI_API_KEY=YOUR_API_KEY,DEMO_MODE=false" \
     --cpu=2 \
     --memory=4Gi \
     --no-cpu-throttling
   ```

2. **Crucial Settings for Playwright**:
   - **`--cpu=2 --memory=4Gi`**: Allocates enough memory and CPU for Chromium to run smoothly.
   - **`--no-cpu-throttling`**: Disables Cloud Run's default behavior of throttling CPU outside of request boundaries, allowing background Python agent processes to run without freezing.
