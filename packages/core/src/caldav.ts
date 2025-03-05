import { createDAVClient } from 'tsdav';

export interface CalDavCredentialsOAuth {
  tokenUrl: string;
  username: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

export interface CalDavCredentialsBasic {
  username: string;
  password: string;
}

export type CalDavCredentials = CalDavCredentialsOAuth | CalDavCredentialsBasic;

export type CalDavClientMethod = 'OAuth' | 'Basic';

interface CalDavClientOptionsBase {
  serverUrl: string;
  credentials: CalDavCredentials;
  defaultAccountType: 'caldav';
  authMethod: CalDavClientMethod;
}

export interface CalDavClientOptionsOAuth extends CalDavClientOptionsBase {
  credentials: CalDavCredentialsOAuth;
  authMethod: 'OAuth';
}

export interface CalDavClientOptionsBasic extends CalDavClientOptionsBase {
  credentials: CalDavCredentialsBasic;
  authMethod: 'Basic';
}

export type CalDavClientOptions =
  | CalDavClientOptionsOAuth
  | CalDavClientOptionsBasic;

export const createCalDavClient = async (options: CalDavClientOptions) => {
  if (options.authMethod === 'OAuth') {
    return await createDAVClient({ ...options, authMethod: 'Oauth' });
  }
  return await createDAVClient(options);
};

export type CalDavClient = ReturnType<Awaited<typeof createCalDavClient>>;
