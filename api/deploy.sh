#!/usr/bin/env bash
set -euo pipefail

PROJECT="$(gcloud config get-value project)"
TAG="$(git rev-parse --short HEAD)"
IMAGE="us-central1-docker.pkg.dev/$PROJECT/atlas/api:$TAG"

echo "Building $IMAGE via Cloud Build..."
gcloud builds submit --tag="$IMAGE" .

echo "Updating Cloud Run service..."
gcloud run services update atlas-api --region=us-central1 --image="$IMAGE"

echo "Done. Service URL:"
gcloud run services describe atlas-api --region=us-central1 --format='value(status.url)'
