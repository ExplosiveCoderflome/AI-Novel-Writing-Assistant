// Compatibility entrypoint; publishers should import ./publisher without application handlers.
export * from "./publisher";
export { registerNovelEventHandlers } from "./handlers/registerNovelEventHandlers";
