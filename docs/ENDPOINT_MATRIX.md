# Tapin endpoint matrix

Audited against <https://docs.tapin.ir/> on 2026-11-07. Tapin documents these operations below `https://api.tapin.ir/api/v2/public/`. They use `POST` except `order/post/detail/list/html/{order_id}`, which uses `GET`. This package is unofficial. `JSON read` operations are safe to retry only when the host application also confirms its own timeout and rate-limit policy. Mutations are never retried automatically.

| Resource  | Client method                        | Path                                                  | Capability                                                   | Response |
| --------- | ------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------ | -------- |
| Orders    | `register`                           | `order/post/register/`                                | mutation; funds/barcode consequences depend on explicit mode | JSON     |
| Orders    | `edit`                               | `order/post/edit/`                                    | mutation; only provider-editable states/fields               | JSON     |
| Orders    | `checkPrice`                         | `order/post/check-price/`                             | read                                                         | JSON     |
| Orders    | `list`                               | `order/post/list/`                                    | read                                                         | JSON     |
| Orders    | `detail`                             | `order/post/detail/`                                  | read                                                         | JSON     |
| Orders    | `detailHtml`                         | `order/post/detail/html/`                             | read                                                         | stream   |
| Orders    | `detailHtmlBulk`                     | `order/post/detail/html/bulk/`                        | read                                                         | stream   |
| Orders    | `detailListHtml`                     | `order/post/detail/list/html/{order_id}`              | read                                                         | stream   |
| Orders    | `label`                              | `order/post/detail/label/`                            | read                                                         | stream   |
| Orders    | `labelByDate`                        | `order/post/detail/label/date/`                       | read                                                         | stream   |
| Orders    | `changeStatus`                       | `order/post/change-status/`                           | mutation                                                     | JSON     |
| Orders    | `changeStatusBulk`                   | `order/post/change-status/bulk/`                      | mutation                                                     | JSON     |
| Orders    | `changeStatusReport`                 | `order/post/change-status/report/`                    | read                                                         | JSON     |
| Orders    | `lastChangeStatus`                   | `order/post/change-status/report/last-change-status/` | read                                                         | JSON     |
| Orders    | `statusBulk`                         | `order/post/get-status/bulk/`                         | read                                                         | JSON     |
| Orders    | `statusReport`                       | `order/post/get-status/report/`                       | read                                                         | JSON     |
| Orders    | `barcodeHtml`                        | `order/post/barcode/html/`                            | read                                                         | stream   |
| Orders    | `kiosks`                             | `order/post/kiosk/`                                   | read                                                         | JSON     |
| Orders    | `packingBoxes`                       | `order/post/packing-box/`                             | read                                                         | JSON     |
| Products  | `list`, `create`, `update`, `delete` | `product/{operation}/`                                | mixed                                                        | JSON     |
| Products  | `categories`                         | `product/category/list/`                              | read                                                         | JSON     |
| Shops     | `list`, `create`, `detail`           | `shop/{operation}/`                                   | mixed                                                        | JSON     |
| Locations | `tree`                               | `state/tree/`                                         | read                                                         | JSON     |
| Locations | `cities`                             | `city/list/`                                          | read                                                         | JSON     |
| Finance   | `credit`                             | `transaction/credit/`                                 | financial read                                               | JSON     |
| Finance   | `createPayment`                      | `transaction/indirect/new/`                           | financial mutation                                           | JSON     |
| Finance   | `payments`                           | `transaction/online-increase-credit/list/`            | financial read                                               | JSON     |
| Tasks     | `list`, `detail`                     | `task/{operation}/`                                   | read                                                         | JSON     |
| Customers | `list`                               | `customer/list/`                                      | read                                                         | JSON     |
| Customers | `categories`                         | `customer/category/list/`                             | read                                                         | JSON     |
| Employees | `list`                               | `employee/list/`                                      | read                                                         | JSON     |

## Known documentation ambiguities

- Authentication examples conflict between a bare token and a `JWT ` prefix; the client supports both explicitly.
- `state/tree/` is documented with both a full-tree array response and a paginated province-list response.
- Document endpoints do not fully specify content types. The client accepts only PDF and HTML streams and rejects other types.
- `transaction/indirect/pay/` is shown as a returned payment redirect URL rather than a directly callable API operation, so it is intentionally not exposed as a client mutation.
- Tapin does not publish an OpenAPI schema, rate limits, a sandbox contract, or a formal deprecation policy. Provider payloads therefore remain available as raw `entries` until endpoint-specific schemas are verified.
- The separate “Direct Payment” documentation sends merchant requests directly to Zarinpal rather than the authenticated Tapin API. It is intentionally not exposed as a Tapin client method.
