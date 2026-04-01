import { EventHandler } from './types';
import { appleNewsHandler } from './appleNews';

export const handler: EventHandler = (event, context) => {
  if (event.type === 'appaction.call') {
    return appleNewsHandler(event, context);
  }
  throw new Error('Bad Request: Unknown Event');
};
