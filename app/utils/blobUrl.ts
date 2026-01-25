// import type { IconData } from "~/types/plannerData";

// /**
//  * Converts raw Base64 data to a Blob URL. (Synchronous)
//  * @param base64Data - Raw Base64 string without 'data:...' prefix
//  * @param mimeType - MIME type of the image (Default: 'image/webp')
//  * @returns Blob URL (e.g., 'blob:http://...') or null on error
//  */
// function base64ToBlobUrl(base64Data: string, mimeType: string = 'image/webp'): string | null {
//     try {
//         // 1. Decode Base64 data. (atob)
//         const byteCharacters = atob(base64Data);

//         // 2. Convert decoded string to byte array.
//         const byteNumbers = new Array(byteCharacters.length);
//         for (let i = 0; i < byteCharacters.length; i++) {
//             byteNumbers[i] = byteCharacters.charCodeAt(i);
//         }

//         // 3. Convert to Uint8Array (8-bit unsigned integer array).
//         const byteArray = new Uint8Array(byteNumbers);

//         // 4. Create Blob object.
//         const blob = new Blob([byteArray], { type: mimeType });

//         // 5. Create and return Blob URL.
//         const blobUrl = URL.createObjectURL(blob);

//         return blobUrl;
//     } catch (error) {
//         console.error("Error creating Blob URL:", error);
//         // (e.g., Error occurs in 'atob' if Base64 string is invalid)
//         return null;
//     }
// }

// // --- Type Definitions ---
// /** Key: Number, Value: Base64 String */
// type Base64Object = { [key: string]: string };
// /** Key: Number, Value: Blob URL String */
// type BlobUrlObject = { [key: string]: string };

// /**
//  * Converts Base64 object to Blob URL object.
//  * @param base64Obj - Base64 string object in { [key: number]: string } format
//  * @returns Blob URL object in { [key: string]: string } format (Keys with failed conversion may be excluded)
//  */
// function convertBase64ObjectToBlobUrls(base64Obj: Base64Object): BlobUrlObject {
//     // 1. Convert object to [key, value] pair array
//     // Note: Object.entries returns keys as strings
//     const entries: [string, string][] = Object.entries(base64Obj);

//     // 2. Convert each item's value(base64) to blobUrl
//     const transformedEntries: [string, string | null][] = entries.map(([key, base64Value]) => {
//         const blobUrl = base64ToBlobUrl(base64Value, 'image/webp');
//         // Convert key back to number
//         return [key, blobUrl];
//     });

//     // 3. Filter only successfully converted items (non-null)
//     const validEntries = transformedEntries
//         .filter((entry): entry is [string, string] => entry[1] !== null);

//     // 4. Reassemble into object
//     const blobUrlObj: BlobUrlObject = Object.fromEntries(validEntries);

//     return blobUrlObj;
// }

// function convertIconToBolbUrls(iconData: IconData) {

//     const entries: [string, Record<string, string>][] = Object.entries(iconData);

//     const transformedEntries: [string, Record<string, string> | null][] = entries.map(([key, base64Obj]) => {
//         const blobUrlObj = convertBase64ObjectToBlobUrls(base64Obj)
//         return [key, blobUrlObj];
//     });

//     const validEntries = transformedEntries
//         .filter((entry): entry is [string, Record<string, string>] => entry[1] !== null);

//     // 4. Reassemble into object
//     const blobUrlObj = Object.fromEntries(validEntries);

//     return blobUrlObj
// }
