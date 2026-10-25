import { TURKEY_ONLY_MESSAGE } from '../location/turkey'

// Sunucunun İngilizce metinleri kullanıcıya gösterilmez; burada Türkçe karşılıklarına çevrilir.
export const NO_IMAGE_MESSAGE = 'Bu konum için açık lisanslı bir görsel bulunamadı. Yakındaki başka bir noktayı dene.'
export const GENERATION_FAILED_MESSAGE = 'Sahne üretilemedi. Biraz sonra tekrar dene.'
export const BAD_REQUEST_MESSAGE = 'İstek geçersiz.'

/** FAILED sahnenin sunucu hata metni → Türkçe mesaj. */
export function failedMessage(serverError: string | null): string {
  return serverError === 'no image found for location' ? NO_IMAGE_MESSAGE : GENERATION_FAILED_MESSAGE
}

/** HTTP 400 gövdesindeki sunucu metni → Türkçe mesaj. */
export function badRequestMessage(serverError: string): string {
  return serverError === 'location outside supported area' ? TURKEY_ONLY_MESSAGE : BAD_REQUEST_MESSAGE
}

export const NOT_FOUND_MESSAGE = 'Sahne artık bulunamıyor. Tekrar oluştur.'
export const BUSY_MESSAGE = 'Şu anda çok fazla sahne üretiliyor. Birazdan tekrar dene.'

/**
 * HTTP hata durumları → Türkçe mesaj; sunucunun `error` metni hiçbir yolda gösterilmez.
 * 4xx/5xx dışındaki durumlar (ör. 200 + geçersiz gövde) istemcinin kendi Türkçe mesajını taşır.
 */
export function apiErrorMessage(status: number, clientMessage: string): string {
  if (status < 400) return clientMessage
  if (status === 400) return badRequestMessage(clientMessage)
  if (status === 404) return NOT_FOUND_MESSAGE
  if (status === 503) return BUSY_MESSAGE
  return GENERATION_FAILED_MESSAGE
}
