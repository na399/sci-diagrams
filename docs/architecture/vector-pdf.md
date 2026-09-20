# Vector PDF export

## Contract

`outputs.pdf: true` requests PDF bytes from the existing renderer. The figure first passes through the normal resolver, measurement, composition, routing and strict SVG export. PDF consumes that SVG, not a screenshot and not a second diagram engine.

A PDF-only request returns `pdf` without an implicit `svg` field. Request both flags to retain both artifacts. Failures in strict SVG export prevent PDF output. Expected print-validation errors use the normal renderer Issue envelope with `stageCode: E_PDF` and `/outputs/pdf`; unexpected browser/programming failures propagate.

## Isolation and cleanup

`printVectorPdf` obtains a dedicated prepared page, including the caller's staged fonts. It never changes the pooled source scene's print dimensions or styles. The page blocks network requests during validation/printing. Sanitized SVG is inserted into a shadow root to isolate it from Eraser's page CSS. The page closes on success and failure.

The sanitizer is the same bounded, inert SVG intake used by publication checks and imported plot assets. It rejects active/external/raster content before insertion. There is no fallback to a bitmap PDF.

## Sizing

Width and height must be positive absolute SVG lengths. `mm`, `cm`, `in`, `pt`, and CSS `px` use their absolute-unit conversions; screen DPI is irrelevant. PDF dimensions are limited to 1000 mm per side. The SVG aspect ratio is retained, page margins are zero, print scale is one, and the SVG fills one page.

Chromium may round the physical page box. Regression checks allow less than one PDF point of difference from the requested dimensions. Exact decimal byte identity is not a compatibility promise.

## Fonts and editability

SVG retains text elements and font-family declarations. PDF text/font representation is produced by Chromium. Tested simple labels remain searchable and the fixture PDF contains drawing operators without raster images. That result does not certify every font, writing system, imported plot or external editor.

Pin fonts and browser versions in a publication workflow. Inspect font embedding, extracted text and physical dimensions for the actual publication figure. No new font files are distributed by this change. Fonts staged by a caller are trusted application configuration, not assets an untrusted figure may fetch.

## Test coverage

The committed real-renderer suite checks all output formats, PDF-only typing/selection, concurrent calls, expected-error recovery, repeat SVG stability, source immutability, one-page sizing, searchable text and absence of image objects. Poppler `pdfinfo` and `pdftotext` are test-only prerequisites installed by CI.

The implementation environment verified the print helper with actual local Chromium and inspected five generated PDFs. The complete workspace integration suite still needs to pass in the pinned repository environment. PDF metadata can vary between runs; deterministic source/SVG provenance and PDF artifact hashes have different purposes.
