import { v1 } from 'uuid';
import vision from '@google-cloud/vision';
import { Storage } from '@google-cloud/storage';
import env from '../../environment/index.mjs';

const { GOOGLE } = env;
const client = new vision.ImageAnnotatorClient({
  credentials: GOOGLE.CREDENTIALS,
});
const storage = new Storage({
  credentials: GOOGLE.CREDENTIALS,
});

// The folder to store the where 'output' is store folder
// todo надо создавать эту директорию в Google Cloud Platform
//  а также дать доступ на запись в Google Cloud пользователю установленного при инициализации vision
const resultsFolder = 'results';

/**
 * @param {string} filename - file name
 * @returns {Promise<any>}
 */
export const getFile = async (filename) => {
  const result = await storage
    .bucket(GOOGLE.CLOUD.bucketName)
    .file(filename)
    .download();
  return result;
};

export const removeFile = async (filename) => {
  const deleteOptions = {
  };
  await storage.bucket(GOOGLE.CLOUD.bucketName).file(filename).delete(deleteOptions);
};

/**
 * @description Lists files in the bucket, filtered by a prefix
 * @returns {Promise<File[]>}
 */
const _listFilesByPrefix = async () => {
  // todo директорию results надо создать в google storage
  const options = {
    prefix: 'results',
  };
  const [files] = await storage
    .bucket(GOOGLE.CLOUD.bucketName)
    .getFiles(options);
  return files;
};

/**
 * @description Uploads binary file to google storage
 * @param {Buffer} file - file
 * @param {string} filename - filename
 * @returns {Promise<string>} - storage filename
 */
export const uploadFile = async (file, filename) => {
  await storage.bucket(GOOGLE.CLOUD.bucketName).file(filename).save(file);
  return filename;
};

// загружаем бинарник в cloud, производим расчеты, получаем сгенерированный json, разбиваем его на объекты
export default async (buffer, filename = v1()) => {
  const fileUploaded = await uploadFile(
    buffer,
    filename,
  );
  const file = await pdfReader(fileUploaded);
  const storageFile = await getFile(file);
  if (!Array.isArray(storageFile)) {
    throw new Error('Not result');
  }
  const filesResponse = JSON.parse(storageFile[0].toString());

  const [{fullTextAnnotation, _context}] = filesResponse.responses;
  const { /* pages, */ text} = fullTextAnnotation;
  await removeFile(filename);

  return text;
};

/**
 * @param {string} fileName - Path to PDF file within bucket
 * @returns {Promise<string>} - destination uri
 */
export const pdfReader = async (fileName) => {
  const request = {
    requests: [
      {
        inputConfig: {
          gcsSource: {
            uri: `gs://${GOOGLE.CLOUD.bucketName}/${fileName}`,
          },
          mimeType: 'application/pdf',
        },
        features: [
          {
            type: 'DOCUMENT_TEXT_DETECTION',
          },
        ],
        outputConfig: {
          gcsDestination: {
            uri: `gs://${GOOGLE.CLOUD.bucketName}/${resultsFolder}/`,
          },
          batchSize: 1,
        },
      },
    ],
  };
  const [operation] = await client.asyncBatchAnnotateFiles(request);
  const [filesResponse] = await operation.promise();

  // hack стандартно батчинге файл именуется как "output-1-to-1.json"
  if (filesResponse.responses[0].outputConfig.gcsDestination.uri) {
    return `${resultsFolder}/output-1-to-1.json`;
  }
  throw new Error('Vision response unknown');
};
