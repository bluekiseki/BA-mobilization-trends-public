// app/routes.ts
import { type RouteConfig, route, index } from '@react-router/dev/routes';

export default [
  // 1. Routes that do not require a locale, such as APIs (placed at the top)
  route('/api/locales/:lng/:ns', 'routes/api/locales.ts'),
  route('/api/contract', 'routes/api/email.ts'),
  route('/api/calendar', 'routes/api/calendar.ts'),
  route('/api/notices', 'routes/api/notices.ts'),
  route('/api/graphql', 'routes/api/graphql.ts'),
  route('/api/auth/*', 'routes/api/auth.$.ts'),
  route('/api/auth-ext', 'routes/api/auth-ext.ts'),

  route('source', 'routes/licence.tsx'), // only english
  route('privacy', 'routes/privacy.tsx'), // only english
  route('terms', 'routes/terms.tsx'), // only english

  // 2. Layout wrapping all routes that require locale processing
  // Set path to ':locale?' so all child routes can receive the locale parameter
  route(':locale?', 'routes/layout.tsx', [
    index('routes/home.tsx'), // -> / or /ko

    // Charts
    route('charts/:server/heatmap', 'routes/charts/heatmap.tsx'),
    route('charts/:server/ranking', 'routes/charts/ranking.tsx'),
    route('charts/favor', 'routes/charts/favor.tsx'),

    // Dashboard
    route('dashboard/:server/', 'routes/dashboard/index.tsx'),
    route('dashboard/:server/:id/:type', 'routes/dashboard/$server.$id.$type.tsx'),
    route('dashboard/:server/:id', 'routes/dashboard/$server.$id.tsx'),
    route('dashboard/:server/videos', 'routes/dashboard/$server.videos.tsx'),

    // Planner
    route('planner/event', 'routes/planner/EventMainPage.tsx'),
    route('planner/event/:eventId', 'routes/planner/EventPage.tsx'),
    route('planner/students', 'routes/planner/Student.tsx'),
    route('planner/equipment', 'routes/planner/Equipment.tsx'),
    route('planner/gacha', 'routes/planner/Gacha_v2.tsx'),
    route('planner/gacha_old', 'routes/planner/Gacha_old.tsx'),
    route('planner/gacha-test', 'routes/debug-gacha.tsx'),
    route('planner/item-scanner', 'routes/planner/ItemScanner.tsx'),

    // Others
    route('utils/jukebox', 'routes/utils/jukebox.tsx'),
    route('utils/favor', 'routes/utils/favor.tsx'),
    route('live', 'routes/live/index.tsx'),
    route('calendar/:server?', 'routes/calendar.tsx'),
    route('notices', 'routes/notices/index.tsx'),
    route('notices/:postId', 'routes/notices/detail.tsx'),

    // account
    route('login', 'routes/login.tsx'),
    route('signup', 'routes/signup.tsx'),
    route('signup-passkey', 'routes/signup-passkey.tsx'),
    route('magic-link-redirect', 'routes/magic-link-redirect.tsx'),
    route('settings', 'routes/settings/index.tsx'), // -> /settings or /ko/settings
  ]),

  // 3. All other requests that do not match the conditions above (404)
  route('*', 'routes/404.tsx'),
] satisfies RouteConfig;
