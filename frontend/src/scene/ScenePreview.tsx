interface Props {
  src: string
  caption: string
}

/** Panorama önizlemesi. #4 gelince 360° görüntüleyici bu bileşenin yerine geçer. */
export function ScenePreview({ src, caption }: Props) {
  return (
    <figure className="scene-preview">
      <img src={src} alt={caption} />
      <figcaption>{caption}</figcaption>
    </figure>
  )
}
