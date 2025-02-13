Write-Host "🚀 Building Docker image..."
npm run docker:build

Write-Host "🚀 Deploying to Cloud Run..."
npm run docker:deploy

Write-Host "✅ Deployment complete!"
