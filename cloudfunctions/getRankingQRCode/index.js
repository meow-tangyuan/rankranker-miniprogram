// cloudfunctions/getRankingQRCode/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { scene, page = 'pages/result/result' } = event;

  try {
    const result = await cloud.openapi.wxacode.getUnlimited({
      scene,
      page,
      width: 280,
      isHyaline: false
    });

    const fileName = `qrcodes/${Date.now()}_${Math.random().toString(36).substr(2, 6)}.png`;
    const uploadResult = await cloud.uploadFile({
      cloudPath: fileName,
      fileContent: result.buffer
    });

    const { fileList } = await cloud.getTempFileURL({
      fileList: [uploadResult.fileID]
    });

    return {
      success: true,
      fileUrl: fileList[0].tempFileURL,
      fileID: uploadResult.fileID
    };
  } catch (err) {
    return { success: false, errMsg: err.message || err.errMsg };
  }
};
