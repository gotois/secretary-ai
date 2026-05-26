import { XMLParser, XMLValidator } from 'fast-xml-parser';

function healthAnalyze(json) {
  // todo странные данные - дополнить в схему
  // json.HealthData.Me;

  return json.HealthData.ClinicalRecord.map((record) => {
    return {
      '@type': 'MedicalEntity',
      'name': record.type,
      'identifier': record.identifier,
      'description': record.sourceName,
      'url': record.sourceURL,
      // fhirVersion: '1.0.2',
      // receivedDate: '2018-12-18 14:06:24 -0600',
    };
  });
}

// AppleHealth - схема для выгрузки
function clinicalAnalyze(_json) {
  // todo дополнить схемой
  return {
    '@type': 'MedicalEntity',
    // json.ClinicalDocument.recordTarget.patientRole;
  };
}

// OFX - схема для выгрузки из банковских счетов
function ofxAnalyze(json) {
  const {BANKTRANLIST} = json.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS;
  const objects = BANKTRANLIST.STMTTRN.map((stmttrn) => {
    return {
      '@type': 'FinancialProduct',
      'name': stmttrn.NAME,
      // broker
      'amount': {
        '@type': stmttrn.TRNTYPE,
        'currency': stmttrn.CURRENCY,
        // todo добавить
        // stmttrn.DTPOSTED,
        // stmttrn.TRNAMT,
        // stmttrn.FITID,
        // stmttrn.MEMO,
      },
    };
  });
  return objects;
}

/**
 * @param xml
 * @param {string} mime
 * @returns {Object[]}
 */
export default (xml, mime) => {
  const context = [];
  const parserOptions = {
    attributeNamePrefix: '',
    ignoreAttributes: false,
    ignoreNameSpace: false,
    allowBooleanAttributes: true,
    parseNodeValue: true,
    parseAttributeValue: true,
    trimValues: true,
    parseTrueNumberOnly: false,
  };
  if (!XMLValidator.validate(xml)) {
    throw new Error('No valid XML');
  }
  const parser = new XMLParser();
  const data = parser.parse(xml, parserOptions, false);

  // в зависимости от свойств файла (например, ClinicalDocument, HTML) присваиваем уникальные типы
  // AppleHealth
  if (Reflect.has(data, 'HealthData')) {
    context.push(healthAnalyze(data));
  }
  if (Reflect.has(data, 'ClinicalDocument')) {
    context.push(clinicalAnalyze(data));
  }
  // OFX
  if (Reflect.has(data, 'OFX')) {
    context.push(ofxAnalyze(data));
  }

  return context;
};
