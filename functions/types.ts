import { FunctionEventHandler, FunctionTypeEnum } from '@contentful/node-apps-toolkit';
import type { AppInstallationParameters } from '../src/types';

export type EventHandler = FunctionEventHandler<FunctionTypeEnum, AppInstallationParameters>;
export type AppActionHandler = FunctionEventHandler<
  FunctionTypeEnum.AppActionCall,
  AppInstallationParameters
>;
