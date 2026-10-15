package com.timeportal.scene;

/** Üretilen sahnenin yapıtları. Adresler frontend'in doğrudan yükleyebileceği yollardır. */
public record SceneResult(String panoramaUrl, String depthUrl) {
}
