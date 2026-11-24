import { SetMetadata } from '@nestjs/common';
import { RAW_RESPONSE_KEY } from './metadata-keys';

export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
