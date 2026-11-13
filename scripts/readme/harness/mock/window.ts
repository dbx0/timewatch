import { frameName, host } from "./host";

const win = {
  isMaximized: async () => false,
  onResized: async () => () => {},
  minimize: async () => host().windowAction(frameName(), "minimize"),
  toggleMaximize: async () => host().windowAction(frameName(), "maximize"),
  close: async () => host().windowAction(frameName(), "close"),
  setFocus: async () => {},
};

export const getCurrentWindow = () => win;
export const getCurrentWebviewWindow = () => win;
