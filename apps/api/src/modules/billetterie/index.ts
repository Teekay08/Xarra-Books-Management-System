import type { FastifyInstance } from 'fastify';
import { projectRoutes }     from './routes/projects.js';
import { teamRoutes }         from './routes/team.js';
import { taskRoutes }         from './routes/tasks.js';
import { milestoneRoutes }    from './routes/milestones.js';
import { timesheetRoutes }    from './routes/timesheets.js';
import { issueRoutes }        from './routes/issues.js';
import { labelRoutes }        from './routes/labels.js';
import { clientPortalRoutes } from './routes/client-portal.js';
import { documentsRoutes }    from './routes/documents.js';
import { deliverablesRoutes } from './routes/deliverables.js';
import { raciRoutes }         from './routes/raci.js';
import { risksRoutes }        from './routes/risks.js';
import { sprintRoutes }       from './routes/sprints.js';
import { supportRoutes }      from './routes/support.js';
import { changeRequestRoutes } from './routes/change-requests.js';
import { testingRoutes }       from './routes/testing.js';
import { requireProduct }     from '../../middleware/require-auth.js';

export async function billetterieRoutes(app: FastifyInstance) {
  // Gate: every Billetterie API route requires billetterieAccess on the user.
  // The client portal (/client-portal/:token) bypasses this via token auth — it
  // is registered BEFORE the preHandler hook below.
  await clientPortalRoutes(app);

  // Apply product guard to all subsequent sub-routes
  app.addHook('preHandler', requireProduct('billetterie'));

  await projectRoutes(app);
  await teamRoutes(app);
  await taskRoutes(app);
  await milestoneRoutes(app);
  await timesheetRoutes(app);
  await issueRoutes(app);
  await labelRoutes(app);
  await documentsRoutes(app);
  await deliverablesRoutes(app);
  await raciRoutes(app);
  await risksRoutes(app);
  await sprintRoutes(app);
  await supportRoutes(app);
  await changeRequestRoutes(app);
  await testingRoutes(app);
}
