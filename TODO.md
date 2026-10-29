# TODO — Suly City

## تأسيس العرض والأداء على الهاتف
- [x] «Set up a WebGLRenderer with `antialias: true` and `powerPreference: "high-performance"`.»
- [x] «Set the pixel ratio to `Math.min(window.devicePixelRatio, 2)` for mobile performance.»
- [x] «Enable Shadow Maps: `renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;`»
- [x] «The goal is to optimize for mobile APK size and performance from day one.» — أزيلت ملفات الخطوط غير المستخدمة، وحجم JavaScript المضغوط في بناء الويب نحو 136.70 KB؛ لا يتضمن هذا التسليم تغليف APK أصليًا.

## الكاميرا الإيزومترية والتحريك
- [x] «Use `THREE.OrthographicCamera` (NOT `PerspectiveCamera`).»
- [x] «Position it at a perfect isometric angle (e.g., X: 50, Y: 50, Z: 50) looking at the center (0,0,0).»
- [x] «Add basic mouse/touch drag controls to pan the camera around the map.»

## الأرض والإضاءة والظلال
- [x] «Add a `THREE.AmbientLight` to brighten the scene (intensity ~0.6).»
- [x] «Add a `THREE.DirectionalLight` (intensity ~1.5) positioned high up. Enable `castShadow = true`.»
- [x] «Configure the DirectionalLight's shadow camera properties (left, right, top, bottom, near, far) properly so shadows are crisp and scale well with the buildings.»
- [x] «Create a large `THREE.PlaneGeometry` for the ground (e.g., 100x100).»
- [x] «Rotate it flat (`-Math.PI / 2` on X-axis).»
- [x] «Use a standard material with a grass-green color and set `receiveShadow = true`.»
- [x] «Add a `THREE.GridHelper` so we can visually see the grid cells (we will hide it later).» — حجم الخلية 2×2 ويتوافق مع قاعدة المبنى.

## المبنى الأول ووضعه بالنقر/اللمس
- [x] «Implement a `createBuilding()` function. Do NOT use external images or textures. Use only Three.js primitives (e.g., `BoxGeometry` for the base and `ConeGeometry` for the roof). Give them solid colors.» — شرط مرحلة التأسيس السابقة؛ استبدله التوجيه الأحدث بصور sprites.
- [x] «Ensure all meshes inside the building have `castShadow = true` and `receiveShadow = true`.» — كان خاصًا بالمباني البدائية؛ sprites الحالية لا ترمي الظلال لمنع الظلال المربعة.
- [x] «Implement a `THREE.Raycaster`. When the user taps/clicks on the ground plane, instantiate the building and place it at the clicked coordinates.» — يلتقط النقرة ويُحاذي المبنى إلى مركز أقرب خلية.
- [x] «Pivot Point & Grounding (Y=0): When generating the building, ensure the pivot point is at the absolute bottom center. The building group must be placed at `Y = 0` relative to the ground so it sits perfectly on the grid and does NOT float or sink into the ground.»
- [x] «Shadow Optimization: Ensure the building casts a soft shadow onto the ground to create the 2.5D depth effect.»

## نطاق الأصول والواجهة
- [x] «For this first step, I ONLY want the foundational environment: The Map and the ability to place the first building. Do NOT add any game logic, complex UI, or menus yet.»
- [x] «No External Assets: Keep it 100% procedural (generated via code) to keep the bundle size extremely small and avoid loading issues.» — شرط مرحلة التأسيس السابقة؛ يستخدم التحديث البصري الحالي صور المستخدم الشفافة.
- [x] «The shape of the buildings can be developed later; keep the first building simple and procedural for now.»
- [x] «Output the complete, clean, runnable HTML and JS code.» — مدمج في مشروع Three.js/TypeScript/Vite القائم وقابل للتشغيل والبناء.

## التحقق
- [x] `pnpm build` نجح؛ الحجم المضغوط لملفات JavaScript/CSS نحو 136.70 KB، ولا تُحمّل خطوط.
- [x] `pnpm test` نجح: 78 اختبارًا.
- [x] `pnpm smoke` نجح على سطح المكتب والهاتف: الكاميرا، الأرض، الظلال، المحاذاة، السحب واللمس.
- [x] تحقّق رابط favicon وملف PNG والوصف العربي في مخرجات المشاركة.

## نظام الطرق والقيود والتحكم بالهاتف
- [x] «Create a `createRoadTile()` function. Use a flat grey `PlaneGeometry` for the asphalt, and small white `BoxGeometry` or `PlaneGeometry` strips for dashed lines. Set it slightly above the ground (Y = 0.01) to prevent Z-fighting.» — إنشاء إجرائي مع خطوط بيضاء وظلال استقبال مناسبة.
- [x] «When the user taps the ground, calculate the exact center of the grid cell tapped (using Raycaster and Math.round on the X and Z coordinates).» — يطابق المركز على شبكة 2×2 ويقيّده ضمن الخريطة.
- [x] «Implement a simple toggle mechanism (e.g., a variable `currentMode = 'ROAD'` or `'BUILDING'`, or toggled via a key press for now) so the user can switch between placing roads and placing buildings.» — زر لمسي ومفتاحا R/B؛ يبدأ اللعب بوضع الطريق.
- [x] «A building can ONLY be placed on a grid cell if it is adjacent (shares an edge: North, South, East, or West) to an existing Road tile. If the player taps an empty cell with no adjacent roads, prevent the building from being placed.» — التحقق يقتصر على الجيران الأربعة ويمنع وضع المبنى فوق خلية مشغولة.
- [x] «One-finger drag: Pan the camera smoothly with inertia/damping (glides slightly after the finger lifts).» — قصور مخمّد، مع حدود هدف الكاميرا ضمن أرضية الخريطة.
- [x] «Pinch-to-zoom: Adjust the `OrthographicCamera.zoom` property. Ensure you call `camera.updateProjectionMatrix()` after zooming.» — تكبير قرصي على الهاتف وعجلة فأرة على الكمبيوتر.
- [x] «Clamp the camera bounds so the user cannot pan outside the edges of the ground Plane.» — يقيّد موضع هدف الكاميرا بين مراكز الخلايا الطرفية.
- [x] «Add a visual highlight (e.g., a translucent green or red square mesh) that follows the user's finger/cursor over the grid. It should be Green when placement is valid (e.g., empty cell, adjacent to road) and Red when placement is invalid.» — المربع يتحدث أثناء المؤشر واللمس بحسب الوضع والإشغال والتجاور.
- [x] «Use specific named imports for Three.js (e.g., `import { Raycaster, Vector2, ... } from 'three';`); keep lighting and shadow maps configured exactly as they are (PCFSoftShadowMap); ensure all meshes cast and receive shadows correctly; use procedural primitive geometry only.» — لا أصول خارجية أو نماذج GLTF أو تبعيات جديدة.

## التحديث البصري بالـsprites (الحفاظ على الخريطة والمنطق)
- [x] «DO NOT generate a new map or auto-populate the grid.» — يبدأ العالم دون إضافة طرق أو مبانٍ تلقائيًا؛ فحص smoke يتحقق من خلوه عند البدء.
- [x] «Remove the old procedural `BoxGeometry` building creation. Use `THREE.TextureLoader` to load the uploaded images from the `/assets/` folder.» — نسخ شفافة محسّنة من `House 1.png` و`Shop.png` و`Build 2.png` إلى `public/assets/house.png`, `shop.png`, `skyscraper.png`.
- [x] «Create the buildings using `THREE.PlaneGeometry`. Translate the geometry so the bottom edge is at Y=0; the mesh Y position on the map must be 0.» — التحقق الآلي يتأكد من `geometry.boundingBox.min.y` وموضع المبنى.
- [x] «Use `THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })` so transparent PNG backgrounds work and do not cast square shadows.» — مادة alpha شفافة، والمباني لا ترمي ظلالًا.
- [x] «Keep the current road placement logic exactly as it is. Only upgrade `createRoadTile()`: dark grey base plane, lighter curb on the edges, dashed white lines in the center.» — تعديل زخرفي داخل منشئ الطريق مع إبقاء اختبار وضع الطرق.
- [x] «Implement manual depth sorting in the animation loop; buildings lower on screen render on top of buildings behind them.» — ترتيب كل frame حسب إحداثي الشاشة الرأسي للمرتكز.
- [x] «Add bottom toolbar buttons: Road, House, Shop, Skyscraper.» — لكل نوع اختيار مستقل مع استمرار قواعد الوضع والتجاور.
- [x] فحص `pnpm typecheck`, `pnpm manus:build-source`, `pnpm test`, و`pnpm smoke`؛ التقطت المعاينة من اللعبة بعد وضع sprites يدويًا في جلسة الاختبار.
