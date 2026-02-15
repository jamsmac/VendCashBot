import { SetMetadata } from '@nestjs/common';

export const MODULES_KEY = 'required_modules';
export const RequireModule = (...modules: string[]) => SetMetadata(MODULES_KEY, modules);
