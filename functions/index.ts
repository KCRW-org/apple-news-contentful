import { EventHandler } from './types';
import { appleNewsHandler } from './appleNews';
import { appEventHandler } from './appEvents';

export const handler: EventHandler = (event, context) => {
  if (event.type === 'appaction.call') {
    return appleNewsHandler(event, context);
  }
  if (event.type === 'appevent.handler') {
    return appEventHandler(event, context);
  }
  throw new Error('Bad Request: Unknown Event');
};
