# CAS Importer

Full-stack CAS parser for CDSL statements. Upload PDF statements (including password-protected files) and extract:

- Mutual fund holdings
- Demat holdings
- Mutual fund transactions
- Demat transactions
- Statement summary, yearly valuation, and account details

Deterministic regex/rule-based parsing only (no AI extraction).

## Folder Structure

- `backend/` - Express API + parsing services
- `frontend/` - React dashboard UI
- `backend/data/reports/` - persisted parsed JSON reports

## Run Backend

```bash
cd backend
npm install
PORT=5001 node server.js
```

Backend default is `5001` and frontend proxy is configured to `5001`.

## Run Frontend

```bash
cd frontend
npm install
npm start
```

Frontend dev server runs on `3000` (or next available port such as `3001` if occupied).

## API

### `POST /api/upload-cas`

Form-data fields:

- `file` (required) - CAS PDF
- `password` (optional) - PDF password, must be uppercase

Response includes:

- `portfolio` (backward-compatible alias of `mutualFundHoldings`)
- `mutualFundHoldings`
- `dematHoldings`
- `transactions` (mutual fund transactions)
- `dematTransactions`
- `summary`
- `statementSummary`
- `yearlyValuation`
- `accountDetails`
- `report` metadata (`reportId`, `filename`, fetch/download URLs)

Example shape:

```json
{
  "mutualFundHoldings": [],
  "dematHoldings": [],
  "transactions": [],
  "dematTransactions": [],
  "summary": {
    "totalMutualFunds": 0,
    "totalDematSecurities": 0,
    "totalTransactions": 0,
    "totalMutualFundValue": 0,
    "totalDematValue": 0,
    "totalPortfolioValue": 0,
    "allocation": {
      "mutualFundPercentage": 0,
      "dematPercentage": 0
    },
    "statementSummary": null,
    "yearlyValuation": [],
    "accountDetails": null
  },
  "report": {
    "reportId": "2026-03-16-<uuid>",
    "filename": "2026-03-16-<uuid>.json",
    "fetchUrl": "/api/reports/<id>",
    "downloadUrl": "/api/reports/<id>/download"
  }
}
```

### Saved Report APIs

- `GET /api/reports/:reportId` - fetch saved parsed JSON
- `GET /api/reports/:reportId/download` - download saved JSON file

## Example Curl

```bash
curl -X POST "http://localhost:5001/api/upload-cas" \
  -F "file=@/absolute/path/to/statement.pdf" \
  -F "password=ABCDE7236F"
```
