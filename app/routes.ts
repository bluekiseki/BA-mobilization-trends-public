import { type RouteConfig, route } from '@react-router/dev/routes';

export default [
  // index("routes/home.tsx"),
  route(':locale?', './routes/home.tsx'),
  route(':locale?/source', 'routes/licence.tsx'),
  route(':locale?/charts/:server/heatmap', 'routes/charts/heatmap.tsx'),
  route(':locale?/charts/:server/ranking', 'routes/charts/ranking.tsx'),
  route(':locale?/charts/favor', 'routes/charts/favor.tsx'),
  route(':locale?/dashboard/:server/', 'routes/dashboard/index.tsx'),

  route(':locale?/dashboard/:server/:id/:type', 'routes/dashboard/$server.$id.$type.tsx'),
  route(':locale?/dashboard/:server/:id', 'routes/dashboard/$server.$id.tsx'),

  route(':locale?/planner/event', 'routes/planner/EventMainPage.tsx'),
  route(':locale?/planner/event/:eventId', 'routes/planner/EventPage.tsx'),
  route(':locale?/planner/students', 'routes/planner/Student.tsx'),
  route(':locale?/planner/equipment', 'routes/planner/Equipment.tsx'),
  route(':locale?/planner/gacha', 'routes/planner/Gacha.tsx'),
  route(':locale?/utils/jukebox', 'routes/utils/jukebox.tsx'),

  route(':locale?/live', 'routes/live/index.tsx'),
  route('/api/locales/:lng/:ns', 'routes/api/locales.ts'),
  route('/api/contract', 'routes/api/email.ts'),
  route(':locale?/calendar/:server?', 'routes/calendar.tsx'),

  route('*', 'routes/404.tsx'),
] satisfies RouteConfig;
