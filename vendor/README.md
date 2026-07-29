# vendor/

Third-party code shipped as-is. The app has no build step, so anything we
depend on lives here as a plain file the browser can `<script src>`.

## libheif-bundle.js

`libheif` (the reference HEIC/HEIF decoder) compiled to WebAssembly, from the
[`libheif-js`](https://www.npmjs.com/package/libheif-js) npm package, version
**1.19.8** — the file is `libheif-wasm/libheif-bundle.js`, copied byte-for-byte
and unmodified. The `.wasm` binary is inlined as base64 inside the bundle, so
it's one request and no separate asset path to get wrong under
`capacitor://localhost`.

Why we need it: only Safari decodes HEIC/HEIF natively, and that's what
iPhones shoot by default. Everywhere else a picked `.heic` fails both
`createImageBitmap()` and `<img>`, so `compressImage()` in `app-core.js`
falls back to this decoder and re-encodes the photo to JPEG like any other
upload.

It's ~1.4 MB, so it is **lazily loaded** — the `<script>` tag is only injected
when someone actually picks a HEIC (see `loadHeifDecoder()`). Browsers that
decode HEIC natively, and everyone uploading a JPEG, never fetch it.

To update: `npm pack libheif-js@<version>` and copy
`package/libheif-wasm/libheif-bundle.js` here, along with the licenses.

### Licensing

- `LICENSE-libheif.txt` — LGPL-3.0, covering `libheif` itself. We ship it
  unmodified and separately loadable, which is what the LGPL asks for.
- `LICENSE-libheif-js.txt` — the terms of the `libheif-js` packaging.
