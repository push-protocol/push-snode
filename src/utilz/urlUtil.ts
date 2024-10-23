export class UrlUtil {

    public static append(baseUrl: string, path: string): string {
        if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1); // Remove the trailing slash
        }
        if (path.startsWith('/')) {
            path = path.slice(1); // Remove the leading slash
        }
        return `${baseUrl}/${path}`;
    }
}