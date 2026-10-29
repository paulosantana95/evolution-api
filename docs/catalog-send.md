# Catalog send contract (`2.4.0-paulosantana95`)

These endpoints follow the existing `/message/send*` pattern (`RouterBroker` + JSON Schema + thin controller + Baileys service). They send **native WhatsApp Business catalog messages**. The sender instance must be a WhatsApp Business account that owns (or can share) the products.

There is no Postman collection in this repository; use the payloads below.

## `POST /message/sendProduct/{instance}`

Sends a **single product card** (`productMessage`).

Required JSON fields:

| Field | Type | Notes |
|---|---|---|
| `number` | string | Destination (digits, `@s.whatsapp.net`, `@g.us`, or `@lid`) |
| `productId` | string | Catalog product id from `POST /business/getCatalog/{instance}` |
| `title` | string | Product title shown on the card |
| `productImage` | string | HTTPS URL or base64 (optionally `data:image/...;base64,`) |

Optional: `description`, `currencyCode` (default `BRL`), `priceAmount1000` (integer, thousandths of the currency; `1990` = `1.90`), `retailerId`, `url`, `body`, `footer`, `businessOwnerJid` (defaults to the connected instance JID), `delay`, `quoted`, `mentionsEveryOne`, `mentioned`.

Example:

```json
{
  "number": "5511999999999",
  "productId": "1234567890",
  "title": "Camiseta preta",
  "description": "Algodão 100%",
  "currencyCode": "BRL",
  "priceAmount1000": 5990,
  "retailerId": "SKU-001",
  "url": "https://loja.example/p/camiseta",
  "productImage": "https://loja.example/img/camiseta.jpg",
  "body": "Confira este produto",
  "footer": "Loja Exemplo"
}
```

## `POST /message/sendCatalog/{instance}`

Alias: `POST /message/sendProductList/{instance}` (same DTO, schema and handler).

Sends a **product list** (`listMessage` + `listType = PRODUCT_LIST`). Do not use `/message/sendList` for this — `sendList` is a text `SINGLE_SELECT` menu.

Required JSON fields:

| Field | Type | Notes |
|---|---|---|
| `number` | string | Destination |
| `title` | string | List title |
| `buttonText` | string | Button label |
| `headerImage` | string | HTTPS URL or base64 used as the list thumbnail |
| `productIds` **or** `sections` | array | At least one product id. Max 30 products in total |

Optional: `description`, `footerText`, `businessOwnerJid`, `delay`, `quoted`, `mentionsEveryOne`, `mentioned`.

Flat list example:

```json
{
  "number": "5511999999999",
  "title": "Catálogo da loja",
  "description": "Produtos em destaque",
  "footerText": "Toque para ver",
  "buttonText": "Ver produtos",
  "headerImage": "https://loja.example/img/capa.jpg",
  "productIds": ["1234567890", "0987654321"]
}
```

Sectioned list example:

```json
{
  "number": "5511999999999",
  "title": "Catálogo da loja",
  "buttonText": "Ver produtos",
  "headerImage": "https://loja.example/img/capa.jpg",
  "sections": [
    {
      "title": "Camisetas",
      "productIds": ["1234567890"]
    },
    {
      "title": "Calças",
      "productIds": ["0987654321"]
    }
  ]
}
```

## Fetch (unchanged path)

`POST /business/getCatalog/{instance}` still **reads** the catalog. Failures now return HTTP 500 with the real error instead of `{ isBusiness: false }`.
