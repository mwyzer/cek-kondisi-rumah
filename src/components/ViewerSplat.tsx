"use client";

import { useEffect, useRef, useState } from "react";

// Gaussian Splatting viewer (Spark + three.js), dynamically loaded without SSR by Pemindaian3D.
export default function ViewerSplat({ url, label }: { url: string; label: string }) {
  const wadah = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"memuat" | "siap" | "gagal">("memuat");

  useEffect(() => {
    const el = wadah.current;
    if (!el) return;
    let batal = false;
    let bersihkan = () => {};

    (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const { SparkRenderer, SplatMesh } = await import("@sparkjsdev/spark");
        if (batal) return;

        const renderer = new THREE.WebGLRenderer({ antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(el.clientWidth, el.clientHeight);
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, el.clientWidth / el.clientHeight, 0.01, 1000);
        const spark = new SparkRenderer({ renderer });
        scene.add(spark);

        const mesh = new SplatMesh({ url });
        // Convert COLMAP/OpenCV coordinates (y points down) to three.js coordinates (y points up).
        mesh.quaternion.set(1, 0, 0, 0);
        scene.add(mesh);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        const ro = new ResizeObserver(() => {
          camera.aspect = el.clientWidth / el.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(el.clientWidth, el.clientHeight);
        });
        ro.observe(el);

        bersihkan = () => {
          ro.disconnect();
          renderer.setAnimationLoop(null);
          controls.dispose();
          mesh.dispose();
          spark.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };

        await mesh.initialized;
        if (batal) return bersihkan();

        // Point the camera at the model center, offset by its size.
        const kotak = mesh.getBoundingBox(true).applyMatrix4(mesh.matrixWorld);
        const pusat = kotak.getCenter(new THREE.Vector3());
        const ukuran = kotak.getSize(new THREE.Vector3()).length() || 1;
        camera.position.copy(pusat).add(new THREE.Vector3(0, ukuran * 0.1, ukuran * 0.6));
        controls.target.copy(pusat);
        controls.update();

        renderer.setAnimationLoop(() => {
          controls.update();
          renderer.render(scene, camera);
        });
        setStatus("siap");
      } catch (e) {
        console.error("Viewer 3D gagal:", e);
        if (!batal) setStatus("gagal");
      }
    })();

    return () => {
      batal = true;
      bersihkan();
    };
  }, [url]);

  return (
    <div className="viewer3d" ref={wadah} role="img" aria-label={`3D view of ${label}. Drag to rotate, scroll or pinch to zoom.`}>
      {status !== "siap" && (
        <div className="viewer3d-msg">
          {status === "memuat" ? "Loading 3D model…" : "The 3D model cannot be displayed on this device (WebGL2 required)."}
        </div>
      )}
    </div>
  );
}
