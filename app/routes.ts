// app/routes.ts
import { type RouteConfig, route, index } from '@react-router/dev/routes';

export default [
  // 1. Routes that do not require a locale, such as APIs (placed at the top)
  route('/api/locales/:lng/:ns', 'routes/api/locales.ts'),
  route('/api/contract', 'routes/api/email.ts'),
  route('/api/calendar', 'routes/api/calendar.ts'),
  route('/api/notices', 'routes/api/notices.ts'),

  // 2. Layout wrapping all routes that require locale processing
  // Set path to ':locale?' so all child routes can receive the locale parameter
  route(':locale?', 'routes/layout.tsx', [
    index('routes/home_v2.tsx'), // -> / or /ko
    // route('home-v2', 'routes/home_v2.tsx'), // Test pages
    route('home-old', 'routes/home.tsx'), // Test pages
    route('source', 'routes/licence.tsx'), // -> /source or /ko/source

    // Charts
    route('charts/:server/heatmap', 'routes/charts/heatmap.tsx'),
    route('charts/:server/ranking', 'routes/charts/ranking.tsx'),
    route('charts/favor', 'routes/charts/favor.tsx'),

    // Dashboard
    route('dashboard/:server/', 'routes/dashboard/index.tsx'),
    route('dashboard/:server/:id/:type', 'routes/dashboard/$server.$id.$type.tsx'),
    route('dashboard/:server/:id', 'routes/dashboard/$server.$id.tsx'),

    // Planner
    route('planner/event', 'routes/planner/EventMainPage.tsx'),
    route('planner/event/:eventId', 'routes/planner/EventPage.tsx'),
    route('planner/students', 'routes/planner/Student.tsx'),
    route('planner/equipment', 'routes/planner/Equipment_v2.tsx'),
    // route('planner/equipment', 'routes/planner/Equipment.tsx'),
    // route('planner/equipment-v0', 'routes/planner/Equipment_old.tsx'),
    route('planner/gacha', 'routes/planner/Gacha.tsx'),

    // Others
    route('utils/jukebox', 'routes/utils/jukebox.tsx'),
    route('utils/favor', 'routes/utils/favor.tsx'),
    route('live', 'routes/live/index.tsx'),
    route('calendar/:server?', 'routes/calendar.tsx'),
    route('notices', 'routes/notices/index.tsx'),
    route('notices/:postId', 'routes/notices/detail.tsx'),
  ]),

  // 3. All other requests that do not match the conditions above (404)
  route('*', 'routes/404.tsx'),
] satisfies RouteConfig;
