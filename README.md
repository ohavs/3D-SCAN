# Pano 360° — אפליקציית צילום פנורמה כדורית

אפליקציית Expo (React Native + TypeScript) לאנדרואיד לצילום פנורמות 360°
בסגנון Photaf: מסובבים את הטלפון, האפליקציה מצלמת אוטומטית, וכל תמונה
מוטמעת בזמן אמת על הכדור במקומה האמיתי. הפלט: **JPG equirectangular 2:1**
(ברירת מחדל 4096×2048) מוכן להעלאה ל-Photo Sphere Viewer.

## איך זה עובד (ארכיטקטורה)

הליבה היא מנוע הרכבה מבוסס-חיישנים שרץ ב-`expo-gl` (WebGL גולמי, ללא three.js):

- **מעקב אוריינטציה** (`src/lib/orientation.ts`): קריאות `DeviceMotion` →
  קווטרניון מצלמה→עולם, פורט ישיר של האלגוריתם המוכח של three.js
  `DeviceOrientationControls`, כולל טיפול בכיוון המסך.
- **buffer הרכבה equirectangular** (`src/gl/Compositor.ts` + `src/shaders`):
  שני render targets ב-ping-pong. לכל תמונה, שיידר `BLEND` מקרין כל טקסל של
  ה-equirect לכיוון עולמי, מעביר למערכת המצלמה לפי הקווטרניון של הצילום,
  וממזג עם feather (דעיכה מהשוליים) + משקל לפי זווית פגיעה.
- **תצוגה חיה** (שיידר `DISPLAY`): reverse-equirect lookup שצובע את הפנורמה
  שנאספה על המסך דרך האוריינטציה החיה — האזורים שצולמו נעים עם הסיבוב.
  ה-`GLView` שקוף (TextureView, `isOpaque=false`) ומונח מעל ה-`CameraView`
  החי, כך שהמרכז שאליו מכוונים מציג את המצלמה והשוליים מציגים את הפנורמה.
- **ייצוא** (שיידר `EXPORT` + `GLView.takeSnapshotAsync`): רינדור ה-accum
  ל-FBO ברזולוציית הפלט וקידוד JPEG נייטיב — בלי encoder ב-JS.

## הרצה ב-Expo Go (אנדרואיד)

```bash
npm install
npx expo start
```

סרקו את ה-QR עם Expo Go. הערות:

- **RTL**: בהפעלה ראשונה האפליקציה כופה RTL (`I18nManager.forceRTL`). אם
  הפריסה לא מתהפכת מיד — סגרו ופתחו מחדש את האפליקציה ב-Expo Go פעם אחת.
- חלק מה-API (מצלמה/GL) דורש מכשיר אמיתי, לא אמולטור.

## בנייה ל-APK (EAS)

```bash
npm install -g eas-cli
eas login
eas build:configure        # פעם ראשונה — ימלא projectId
eas build -p android --profile preview
```

פרופיל `preview` מפיק **APK** להתקנה ישירה. `production` מפיק AAB ל-Play Store.

## זרימת מסכים

`app/index` (פתיחה) → `app/permissions` (הרשאות) → `app/calibrate` (כיול
אופק/FOV/רזולוציה) → `app/capture` (צילום) → `app/review` (סקירה + שמירה/שיתוף).

## כיול ופתרון תקלות על המכשיר

המתמטיקה של מיפוי המצלמה היא הנקודה היחידה שכדאי לאמת על מכשיר אמיתי.
כל הכוונונים מרוכזים ונגישים:

| תופעה | פתרון |
|------|-------|
| תפרים אנכיים / חוסר יישור אופקי | כווננו את ה-**FOV** במסך הכיול (ברירת מחדל 66°). |
| התמונה המוטמעת מתהפכת שמאל/ימין | הפכו `mirrorX` ב-`src/lib/fov.ts` (`DEFAULT_CALIBRATION`). |
| התמונה הפוכה מלמעלה/למטה | הפכו `mirrorY`. |
| הפנורמה זזה בכיוון הפוך לסיבוב | בדקו את היחידות של `DeviceMotion.rotation` (מניחים **רדיאנים**); אם המכשיר מחזיר מעלות, הכפילו ב-`π/180` ב-`useOrientation.ts`. |
| מעקב רועד | העלו את ההחלקה (`SMOOTHING`) ב-`src/capture/useOrientation.ts`. |
| צילום אוטומטי רגיש/עצל מדי | שנו `ALIGN_THRESHOLD_RAD` / `maxAngularSpeed` ב-`src/capture/autoCapture.ts`. |

## מבנה הפרויקט

```
app/                    מסכי expo-router (index, permissions, calibrate, capture, review)
src/
  capture/              useOrientation (DeviceMotion→quat), autoCapture
  gl/                   Compositor (מנוע ההרכבה), glHelpers, shaders ב-src/shaders
  lib/                  quaternion, orientation, geo (lon/lat↔dir, targets), fov, save
  session/              SessionContext — state משותף בין מסכים (records, calibration)
  ui/                   Button, ProgressRing, TargetOverlay, PanoViewer, theme
src/shaders/            project/blend/display/export GLSL
```

## דרישות איכות שמומשו

- מעקב אוריינטציה חלק (slerp low-pass) עם טיפול בכיוון מסך.
- feather + incidence weighting להקטנת תפרים; חשיפה ממוזגת.
- כיסוי כדור מלא כולל זנית/נדיר (תקרה/רצפה) — נקודות חיווי ייעודיות.
- צילום אוטומטי עם דחיית רעידות + ביטול/התחל-מחדש.
- שחרור טקסטורות מיד אחרי המיזוג (זיכרון GPU קבוע ללא תלות במספר הצילומים).
- ייצוא 4096×2048 (או 5760×2880) בקידוד נייטיב.
