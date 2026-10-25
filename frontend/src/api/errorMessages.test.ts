import { describe, expect, it } from 'vitest'
import { apiErrorMessage, badRequestMessage, failedMessage } from './errorMessages'

describe('errorMessages', () => {
  it('FAILED metinleri Türkçeye çevrilir', () => {
    expect(failedMessage('no image found for location')).toBe('Bu konum için açık lisanslı bir görsel bulunamadı. Yakındaki başka bir noktayı dene.')
    expect(failedMessage('generation failed')).toBe('Sahne üretilemedi. Biraz sonra tekrar dene.')
    expect(failedMessage('whatever')).toBe('Sahne üretilemedi. Biraz sonra tekrar dene.')
    expect(failedMessage(null)).toBe('Sahne üretilemedi. Biraz sonra tekrar dene.')
  })
  it('dönem sahnesi yoksa Türkçe mesaj verilir', () => {
    expect(failedMessage('no scene for period')).toBe('Bu dönem için sahne henüz yok.')
    expect(failedMessage('No scene for period')).toBe('Sahne üretilemedi. Biraz sonra tekrar dene.')
  })
  it('400 metinleri Türkçeye çevrilir', () => {
    expect(badRequestMessage('location outside supported area')).toBe("Şimdilik yalnızca Türkiye'deki konumlar destekleniyor.")
    expect(badRequestMessage('year out of range')).toBe('İstek geçersiz.')
  })
  it('HTTP durumları Türkçeye çevrilir, sunucu metni kullanılmaz', () => {
    expect(apiErrorMessage(404, 'scene not found')).toBe('Sahne artık bulunamıyor. Tekrar oluştur.')
    expect(apiErrorMessage(503, 'busy')).toBe('Şu anda çok fazla sahne üretiliyor. Birazdan tekrar dene.')
    expect(apiErrorMessage(500, 'NullPointerException')).toBe('Sahne üretilemedi. Biraz sonra tekrar dene.')
    expect(apiErrorMessage(500, 'Sunucu hatası (500)')).toBe('Sahne üretilemedi. Biraz sonra tekrar dene.')
    expect(apiErrorMessage(400, 'location outside supported area')).toBe("Şimdilik yalnızca Türkiye'deki konumlar destekleniyor.")
    expect(apiErrorMessage(200, 'Sunucudan geçersiz yanıt')).toBe('Sunucudan geçersiz yanıt')
  })
})
