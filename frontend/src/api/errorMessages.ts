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
