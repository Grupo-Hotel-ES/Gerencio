// src/types.ts
//
// Tipos compartilhados do mock do Keeta.
// Espelham os campos documentados em:
//   - POST /order/get                             (Query on Order Details)
//   - POST oauth2AuthorizationCodeNotification      (webhook)
//   - POST storeAuthorizationNotification           (webhook)
//   - POST storeAuthorizationRemovalNotification     (webhook)
//   - POST brandAuthorizationRemovalNotification     (webhook)
//
// Não é uma cópia 1:1 de TODOS os campos da doc (ela tem centenas, muitos
// opcionais e usados só em cenários raros de reembolso parcial). Modelamos
// os campos "required" e os mais usados na prática. Se o frontend precisar
// de um campo que falta aqui, é só adicionar — a doc oficial tem a lista
// completa em https://api-docs.mykeeta.com/apis/standard/order

// ---------------------------------------------------------------------------
// Envelope padrão de resposta do Keeta (todo endpoint devolve isso)
// ---------------------------------------------------------------------------
export interface KeetaEnvelope<T> {
  code: number // 0 = sucesso
  message: string // "Success" ou descrição do erro
  data?: T
}

// ---------------------------------------------------------------------------
// POST /order/get
// ---------------------------------------------------------------------------
export interface OrderGetRequest {
  orderViewId: number
  shopId: number
}

export interface BaseOrder {
  orderViewId: number
  chooseTableware: number // 1 = pediu talher, 0 = não
  deliveryTime?: number // ETA em ms (epoch)
  ctime: number // quando o cliente fez o pedido (ms epoch)
  estimatedDiningReadyUrgeTime?: number // só para pickup
  payType: string // ex: "applepay", "Cash"
  payTypeDesc: string // ex: "Apple Pay"
}

export interface MerchantOrder {
  ctime: number
  seqNoStr?: string // número exibido no app / recibo
  status: number // 10 pendente, 20 aceito, 35 pronto, 40 concluído, 50 cancelado
  pushOrderResult?: number
  orderViewId: number
  shopId: number
  shopName: string
  unconfirmedStatusTime?: number
  confirmedStatusTime?: number
  readiedStatusTime?: number
  completedStatusTime?: number
  canceledStatusTime?: number
  userId: number
  userGetMode: 'delivery' | 'pickup'
  estimatedDiningReadyUrgeTime?: number
}

export interface MerchantOrderDeliveryHistory {
  opTime: number
  deliveryStatus: number
}

export interface MerchantOrderDelivery {
  waybillId?: number
  subimitDeliveryResult?: number
  deliveryStatus?: number
  deliveryStatusTime?: number
  arrivedStatusTime?: number
  deliveryMode: string
  courierName?: string
  courierPhone?: string
  courierPrivacyPhone?: string
  merchantOrderDeliveryHisList?: MerchantOrderDeliveryHistory[]
}

export interface DeliveryInfo {
  waybillId?: number
  estimatedTime?: number // segundos restantes até o próximo status
  estimatedAbsolutelyTime?: number // ms epoch do próximo status previsto
}

export interface I18nCurrency {
  currency: string
  region?: string
  country?: string
  locale?: string
}

export interface RecipientPoint {
  latitude: number
  longitude: number
}

export interface RecipientInfo {
  name: string
  phone: string
  interCode: string
  addressName?: string
  houseNumber?: string
  point?: RecipientPoint
  addressStruct?: string // JSON stringificado (ver doc)
  detailAddressStruct?: string // JSON stringificado (ver doc)
}

export interface MerchantFee {
  i18n: I18nCurrency
  productPrice?: number
  brokerage?: number
  activityFee?: number
  diffPrice?: number
  total?: number
  platformServiceFee?: number
}

export interface CustomerFee {
  i18n: I18nCurrency
  productPrice: number
  shippingFee: number
  platformFee?: number
  discounts?: number
  tip: number
  diffPrice: number
  payTotal: number
}

export interface FeeDtl {
  merchantFee: MerchantFee
  customerFee: CustomerFee
}

export interface ProductGroupSku {
  groupSkuId: number
  spuId: number
  spuName: string
  price: number
  priceStr: string
  currency: string
}

export interface ProductGroup {
  groupId: number
  groupName: string
  minNumber?: number
  maxNumber?: number
  status: number
  groupOpenItemCode?: string
  shopProductGroupSkuList?: ProductGroupSku[]
}

export interface Product {
  spuId: number
  skuId: number
  count: number
  price: number
  priceStr: string
  originPrice: number
  originPriceStr: string
  name: string
  id: number
  currency: string
  groups?: ProductGroup[]
  remark?: string
  spec?: string
}

export interface OrderPromotionDtl {
  i18n: I18nCurrency
  type: number
  typeName?: string
  promotionRuleDesc?: string
  activityId: string
  reduceFee: number
  sillAmount?: number
  merchantActivityFee?: number
  platformActivityFee?: number
  mainCategory?: number
}

export interface OrderInfo {
  baseOrder: BaseOrder
  merchantOrder: MerchantOrder
  merchantOrderDeliveries?: MerchantOrderDelivery[]
  deliveryInfos?: DeliveryInfo[]
  orderPromotionDtlList?: OrderPromotionDtl[]
  refundInfos?: unknown[] // só populado quando há reembolso — ver doc se precisar
  recipientInfo: RecipientInfo
  feeDtl: FeeDtl
  rebates?: unknown // só populado em reembolso parcial — ver doc se precisar
  rebatesTag: boolean
  products: Product[]
  bigOrderTag: boolean
  subOrderInfoList?: unknown[] // só populado quando bigOrderTag = true
}

export interface OrderGetData {
  orderInfo: OrderInfo
}

export type OrderGetResponse = KeetaEnvelope<OrderGetData>

// ---------------------------------------------------------------------------
// Webhooks — payloads que o Keeta envia PARA o backend do vendor.
// Aqui modelamos o "corpo" que o mock vai enviar quando disparado.
// ---------------------------------------------------------------------------

export interface Oauth2AuthorizationCodePayload {
  code: string
  state?: string
  appId: number
  timestamp: number
  sig: string
}

export interface StoreAuthorizationPayload {
  appId: number
  shopId: number
  shopName: string
  authId: string
  createTime: number
  opType: 0 // sempre 0 nesse evento (autorização adicionada)
}

export interface StoreAuthorizationRemovalPayload {
  appId: string
  shopId: number
  shopName: string
  authId: string
  createTime: number
  opType: 2 // sempre 2 nesse evento (autorização removida)
}

export interface BrandAuthorizationRemovalPayload {
  appId: string
  authId: string
  createTime: number
  brandId: number
  brandName: string
  shopIds: number[]
  opType: 2 // sempre 2 nesse evento (marca inteira desautorizada)
}

export type WebhookResponse = KeetaEnvelope<undefined>
