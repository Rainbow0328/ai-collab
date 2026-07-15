---
name: images-media
description: Image strategy, visual concepts, technical optimization, SVG, icons, lazy loading, and the strategic use of images and media in web design.
---

# Images and Media

> Every image must serve a purpose — convey information, evoke emotion, provide orientation, or strengthen the brand. Images without purpose are dead weight.

## Scope

Use this skill when you:
- Develop an image strategy for a website
- Design hero sections or image galleries
- Optimize images technically (formats, compression, srcset)
- Use icons and SVGs or build an icon system
- Write or review alt texts
- Make decisions between stock photos and custom imagery

## Principles

### 1. Images Are Content, Not Decoration
Every image serves a purpose. Images without purpose are dead weight and slow down the page.

### 2. Quality Over Quantity
A few high-quality, authentic images are more impactful than many generic stock photos.

### 3. Image Strategy Before Image Selection
Define the visual concept first (style, mood, color palette), then select images.

### 4. Performance Is Non-Negotiable
Images account for 50-70% of page weight. Optimization delivers the greatest performance gains.

### 5. Authenticity Over Perfection
Real people in real situations are more convincing than staged stock photo scenes.

## Rules

### DO: Develop an Image Strategy
- DEFINE a visual concept before selecting images.
- ESTABLISH target audience, desired emotion, and brand image as selection criteria.
- SELECT images with a consistent style (color palette, cropping, lighting).
- ENSURE continuity: maintain a consistent visual language across the entire website.

### DO: Use Images Functionally
Every image serves at least one of these four functions:
- **Layout element:** Header images, backgrounds, patterns for mood.
- **Orientation element:** Anchors for new sections, breaking up text-heavy areas.
- **Content element:** Visualization of complex topics, product photos.
- **Emotional element:** Brand building, mood creation, recognition.

### DO: Show People
- USE authentic people in real situations.
- AVOID staged, obviously posed scenes.
- SHOW diversity in age, gender, and ethnicity where contextually appropriate.

### DO: Optimize Images Technically
- COMPRESS in WebP (standard) or AVIF (progressive).
- DELIVER via `srcset` at least 3 variants (400px, 800px, 1200px).
- USE `picture` for art direction (different crops per viewport).
- SET `width` and `height` attributes to prevent CLS.
- IMPLEMENT `loading="lazy"` below the fold.
- KEEP file sizes under 200KB (hero max. 400KB).

### DO: Write Meaningful Alt Texts
- DESCRIBE the image content precisely for screen readers and SEO.
- AVOID starting with "Image of..."
- SET `alt=""` only for purely decorative images.
- USE descriptive file names (team-meeting-office.webp instead of IMG_4523.webp).

### DO: Use Icons Consistently
- ALWAYS combine icons with text labels.
- USE a consistent icon set across the entire website.
- PREFER SVG icons for sharpness and small file size.

### DO: Prefer SVGs
- USE SVG for logos, icons, illustrations, and simple graphics.
- INLINE SVGs for interactivity (hover color changes, animation).
- USE SVG sprites for frequently used icons.

### DON'T: Use Generic Stock Photos
- AVOID cliche images (smiling business people, handshakes, light bulbs).
- INVEST in custom photo shoots or curated premium stock sources with consistent editing.

### DON'T: Embed Unoptimized Images
- DO NOT serve images at original resolution.
- DO NOT use JPEG/PNG when WebP/AVIF is available.
- DO NOT lazy-load hero images and logos (they must load immediately).

### DON'T: Place Text in Images Without a Fallback
- DO NOT embed important text information exclusively in images.
- Text in images is not accessible, not searchable, and not responsive.

## Patterns

### Hero Image with Overlay
On homepages and landing pages: large-scale image with a semi-transparent overlay for text readability. Headline, subline, and CTA on top. No lazy loading for the hero.

### Image Gallery / Project Showcase
Uniform grid with consistent aspect ratios (16:9 or 4:3). Hover effect with additional info. Lightbox for detail view. Lazy loading below the fold.

### Image Cards
Card with image (upper half), title, excerpt, and CTA (lower half). Consistent aspect ratio. `object-fit: cover` for uniform rendering.

### Responsive Image with Art Direction
`picture` element with different `source` elements. Mobile: tight portrait crop. Desktop: full landscape crop. For code examples, see `references/responsive-images.md`.

### Icon System
For 10+ icons: consistent set (line style or filled, not mixed). SVG sprite for performance. Uniform size (e.g., 24px baseline). Icons always with text label or `aria-label`.

## Anti-Patterns

### Stock Photo Monotony
All images from the same platform, generic and interchangeable. Users recognize stock photos immediately. **Solution:** Custom photos or curated premium stock photos with consistent editing.

### Massive Unoptimized Images
Original camera photos (3-10MB) embedded directly. **Solution:** Build pipeline with automatic compression, resizing, and format conversion.

### Decorative Image Overload
Too many images with no informational value. **Solution:** Every image must pass the "What for?" test. White space is often more effective.

### Missing Alt Texts
Images without an `alt` attribute or with "image1.jpg". Accessibility violation and SEO disadvantage. **Solution:** Descriptive alt texts for content images, `alt=""` for decorative ones.

### Inconsistent Visual Language
Photos with different styles and quality levels mixed together. **Solution:** Image strategy with a defined color treatment, style, and quality standard.

## Checklist

### Strategy
- [ ] Image strategy with style, mood, and color palette defined
- [ ] Visual language consistent across all pages
- [ ] Every image serves at least one function
- [ ] Generic stock photos avoided

### Technical Optimization
- [ ] WebP or AVIF as primary format
- [ ] srcset with at least 3 sizes
- [ ] loading="lazy" below the fold
- [ ] Hero image without lazy loading
- [ ] width and height attributes set
- [ ] Files under 200KB (hero max. 400KB)
- [ ] SVG for logos, icons, illustrations

### Accessibility
- [ ] Alt texts for all content images
- [ ] alt="" for purely decorative images
- [ ] No important text exclusively in images
- [ ] Sufficient contrast for text on images

### Legal
- [ ] Usage rights and licenses verified
- [ ] Image credits properly attributed

## Cross-References

- `responsive-design` -- Responsive images, srcset, picture element
- `ui-design` -- Visual hierarchy and image placement
- `branding-identity` -- Visual language as part of brand identity
- `accessibility` -- Alt texts, contrast, text in images
- `color-theory` -- Image color palette in context of the color concept
