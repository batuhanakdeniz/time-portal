import { describe, expect, it } from 'vitest'
import { badRequestMessage, failedMessage } from './errorMessages'

describe('errorMessages', () => {
  it('FAILED metinleri Türkçeye çevrilir', () => {
    expect(failedMessage('no image found for location')).toBe('Bu konum için açık lisanslı bir görsel bulunamadı. Yakındaki başka bir noktayı dene.')
    expect(failedMessage('generation failed')).toBe('Sahne üretilemedi. Biraz sonra tekrar dene.')
    expect(failedMessage('whatever')).toBe('Sahne üretilemedi. Biraz sonra tekrar dene.')
    expect(failedMessage(null)).toBe('Sahne üretilemedi. Biraz sonra tekrar dene.')
  })
  it('400 metinleri Türkçeye çevrilir', () => {
    expect(badRequestMessage('location outside supported area')).toBe("Şimdilik yalnızca Türkiye'deki konumlar destekleniyor.")
    expect(badRequestMessage('year out of range')).toBe('İstek geçersiz.')
  })
})
