const {
  OPEN_WEATHER_KEY,
  FAT_SECRET_API_ACCESS_KEY,
  FAT_SECRET_API_SHARED_SECRET,
  FAT_SECRET_APPNAME,
  WOLFRAM_ALPHA_APPID,
}  = process.env;

export const OPEN_WEATHER = {
  get KEY() {
    return OPEN_WEATHER_KEY;
  },
};
export const FAT_SECRET = {
  get API_ACCESS_KEY() {
    return FAT_SECRET_API_ACCESS_KEY;
  },
  get API_SHARED_SECRET() {
    return FAT_SECRET_API_SHARED_SECRET;
  },
  get APP_NAME() {
    return FAT_SECRET_APPNAME;
  },
};
export const WOLFRAM = {
  get APP_ID() {
    return WOLFRAM_ALPHA_APPID;
  }
};
