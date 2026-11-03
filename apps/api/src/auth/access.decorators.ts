import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE = 'portal.public';
export const PASSWORD_CHANGE_ROUTE = 'portal.password-change-route';
export const JSON_REQUEST = 'portal.json-request';
export const MANAGEMENT_ROUTE = 'portal.management';
export const ManagementOnly = () => SetMetadata(MANAGEMENT_ROUTE, true);
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const AllowPasswordChange = () => SetMetadata(PASSWORD_CHANGE_ROUTE, true);
export const JsonRequest = () => SetMetadata(JSON_REQUEST, true);
