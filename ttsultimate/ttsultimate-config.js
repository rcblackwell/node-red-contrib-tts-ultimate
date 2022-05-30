module.exports = function (RED) {
    'use strict';

    const AWS = require('aws-sdk');
    const GoogleTTS = require('@google-cloud/text-to-speech');
    const GoogleTranslate = require('google-translate-tts'); // TTS without credentials, limited to 200 chars per row.
    const microsoftAzureTTS = require("microsoft-cognitiveservices-speech-sdk"); // 12/10/2021
    var fs = require('fs');
    var path = require("path");
    var formidable = require('formidable');
    const oOS = require('os');
    const sonos = require('sonos');

    AWS.config.update({
        region: 'us-east-1'
    });

    // Configuration Node Register
    function TTSConfigNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.noderedipaddress = config.noderedipaddress;
        if (node.noderedipaddress === undefined || node.noderedipaddress === "AUTODISCOVER") {
            node.noderedipaddress = GetEthAddress();
            RED.log.info('ttsultimate-config ' + node.id + ': Autodiscover current IP ' + node.noderedipaddress);
        }
        node.whoIsUsingTheServer = ""; // Client node.id using the server, because only a ttsultimate node can use the serve at once.
        node.ttsservice = config.ttsservice || "googletranslate";
        node.TTSRootFolderPath = (config.TTSRootFolderPath === undefined || config.TTSRootFolderPath === "") ? path.join(RED.settings.userDir, "sonospollyttsstorage") : path.join(config.TTSRootFolderPath, "sonospollyttsstorage");
        // node.polly = null;
        // node.googleTTS = null;
        // node.googleTranslateTTS = null;
        // node.microsoftAzureTTS = null;

        // 03/06/2019 you can select the temp dir
        //#region "SETUP PATHS"
        // 26/10/2020 Check for path and create it if doens't exists
        function setupDirectory(_aPath) {

            if (!fs.existsSync(_aPath)) {
                // Create the path
                try {
                    fs.mkdirSync(_aPath);
                    return true;
                } catch (error) { return false; }
            } else {
                return true;
            }
        }
        if (!setupDirectory(node.TTSRootFolderPath)) {
            RED.log.error('ttsultimate-config ' + node.id + ': Unable to set up MAIN directory: ' + node.TTSRootFolderPath);
        }
        if (!setupDirectory(path.join(node.TTSRootFolderPath, "ttsfiles"))) {
            RED.log.error('ttsultimate-config ' + node.id + ': Unable to set up cache directory: ' + path.join(node.TTSRootFolderPath, "ttsfiles"));
        } else {
            RED.log.info('ttsultimate-config ' + node.id + ': TTS cache set to ' + path.join(node.TTSRootFolderPath, "ttsfiles"));
        }
        if (!setupDirectory(path.join(node.TTSRootFolderPath, "ttsultimategooglecredentials"))) {
            RED.log.error('ttsultimate-config ' + node.id + ': Unable to set google creds directory: ' + path.join(node.TTSRootFolderPath, "ttsultimategooglecredentials"));
        } else {
            RED.log.info('ttsultimate-config ' + node.id + ': google credentials path set to ' + path.join(node.TTSRootFolderPath, "ttsultimategooglecredentials"));
        }
        if (!setupDirectory(path.join(node.TTSRootFolderPath, "hailingpermanentfiles"))) {
            RED.log.error('ttsultimate-config ' + node.id + ': Unable to set up hailing directory: ' + path.join(node.TTSRootFolderPath, "hailingpermanentfiles"));
        } else {
            RED.log.info('ttsultimate-config ' + node.id + ': hailing path set to ' + path.join(node.TTSRootFolderPath, "hailingpermanentfiles"));
            // 09/03/2020 Copy defaults to the userDir
            fs.readdirSync(path.join(__dirname, "hailingpermanentfiles")).forEach(file => {
                try {
                    fs.copyFileSync(path.join(__dirname, "hailingpermanentfiles", file), path.join(node.TTSRootFolderPath, "hailingpermanentfiles", file));
                } catch (error) { }
            });
        }
        if (!setupDirectory(path.join(node.TTSRootFolderPath, "ttspermanentfiles"))) {
            RED.log.error('ttsultimate-config ' + node.id + ': Unable to set up permanent files directory: ' + path.join(node.TTSRootFolderPath, "ttspermanentfiles"));
        } else {
            RED.log.info('ttsultimate-config ' + node.id + ': permanent files path set to ' + path.join(node.TTSRootFolderPath, "ttspermanentfiles"));
            // 09/03/2020 // Copy the samples of permanent files into the userDir
            fs.readdirSync(path.join(__dirname, "ttspermanentfiles")).forEach(file => {
                try {
                    fs.copyFileSync(path.join(__dirname, "ttspermanentfiles", file), path.join(node.TTSRootFolderPath, "ttspermanentfiles", file));
                } catch (error) { }
            });
        }
        //#endregion


        //#region "INSTANTIATE SERVICE ENGINES"
        // POLLY
        if (node.ttsservice === "polly") {
            var params = {
                accessKeyId: node.credentials.accessKey,
                secretAccessKey: node.credentials.secretKey,
                apiVersion: '2016-06-10'
            };
            try {
                node.polly = new AWS.Polly(params);
                RED.log.info("ttsultimate-config " + node.id + ": Polly service enabled.")
            } catch (error) {
                RED.log.warn("ttsultimate-config " + node.id + ": Polly service disabled. " + error.message)
            }
        } else {
            //RED.log.info("ttsultimate-config " + node.id + ": Polly service not used.");
        }


        // Google TTS with authentication
        if (node.ttsservice === "googletts") {
            try {
                // 23/12/2020 Set environment path of googleTTS
                RED.log.info("ttsultimate-config " + node.id + ": Google credentials are stored in the file " + path.join(node.TTSRootFolderPath, "ttsultimategooglecredentials", "googlecredentials.json"));
                process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(node.TTSRootFolderPath, "ttsultimategooglecredentials", "googlecredentials.json");
                try {
                    node.googleTTS = new GoogleTTS.TextToSpeechClient();
                    RED.log.info("ttsultimate-config " + node.id + ": Google TTS service enabled. ")
                } catch (error) {
                    RED.log.warn("ttsultimate-config " + node.id + ": Google TTS service disabled. " + error.message)
                }
            } catch (error) {
                RED.log.warn("ttsultimate-config " + node.id + ": Google TTS service error: " + error.message)
            }

        } else {
            // RED.log.info("ttsultimate-config " + node.id + ": Google TTS service not used.");
        }



        // Google Translate without authentication 
        if (node.ttsservice === "googletranslate") {
            try {
                node.googleTranslateTTS = GoogleTranslate;
            } catch (error) {
                //RED.log.info("ttsultimate-config " + node.id + ": Google Translate free service not used.");
            }
        } else {
            //RED.log.info("ttsultimate-config " + node.id + ": Google Translate free service not used.");
        }


        // 12/10/2021 Microsoft Azure TTS SpeechConfig.fromSubscription(subscriptionKey, serviceRegion) 
        if (node.ttsservice === "microsoftazuretts") {
            // #########################################
            node.setMicrosoftAzureVoice = function (_voiceName) {
                let speechConfig = microsoftAzureTTS.SpeechConfig.fromSubscription(node.credentials.mssubscriptionKey, node.credentials.mslocation);
                speechConfig.speechSynthesisVoiceName = _voiceName;
                speechConfig.speechSynthesisOutputFormat = microsoftAzureTTS.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
                node.microsoftAzureTTS = new microsoftAzureTTS.SpeechSynthesizer(speechConfig);
                return node.microsoftAzureTTS;
            }
            try {

                let speechConfig = microsoftAzureTTS.SpeechConfig.fromSubscription(node.credentials.mssubscriptionKey, node.credentials.mslocation);
                //speechConfig.speechSynthesisLanguage = "it-IT";
                //speechConfig.speechSynthesisVoiceName = "it-IT-IsabellaNeural";
                speechConfig.speechSynthesisOutputFormat = microsoftAzureTTS.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3;
                node.microsoftAzureTTS = new microsoftAzureTTS.SpeechSynthesizer(speechConfig);
                node.microsoftAzureTTSVoiceList = [];
                // Get the voices
                async function listVoicesAzure() {
                    const httpsAzure = require('https')
                    let options = {
                        hostname: node.credentials.mslocation + '.tts.speech.microsoft.com',
                        port: 443,
                        path: '/cognitiveservices/voices/list',
                        method: 'GET',
                        headers: {
                            'Ocp-Apim-Subscription-Key': node.credentials.mssubscriptionKey
                        }
                    }
                    const reqAzure = httpsAzure.request(options, resVoices => {
                        var sChunkResponse = "";
                        resVoices.on('data', d => {
                            sChunkResponse += d.toString();
                        })
                        resVoices.on('end', () => {
                            try {
                                let oVoices = JSON.parse(sChunkResponse);
                                RED.log.info('ttsultimate-config ' + node.id + ': Microsoft Azure voices count: ' + oVoices.length);
                                for (let index = 0; index < oVoices.length; index++) {
                                    const element = oVoices[index];
                                    node.microsoftAzureTTSVoiceList.push({ name: element.ShortName + " (" + element.Gender + ")", id: element.ShortName })
                                }
                            } catch (error) {
                                RED.log.error('ttsultimate-config ' + node.id + ': listVoices: Error parsing Microsoft Azure TTS voices: ' + error.message);
                                node.microsoftAzureTTSVoiceList.push({ name: "Error parsing Microsoft Azure voices: " + error.message + " Check cretentials, deploy and restart node-red.", id: "Ivy" });
                            }
                        })
                    })
                    reqAzure.on('error', error => {
                        RED.log.error('ttsultimate-config ' + node.id + ': listVoices: Error contacting Azure for getting the voices list: ' + error.message);
                        node.microsoftAzureTTSVoiceList.push({ name: "Error getting Microsoft Azure voices: " + error.message + " Check cretentials, deploy and restart node-red.", id: "Ivy" })
                        reqAzure.end();
                    })
                    reqAzure.end();
                };
                RED.log.info("ttsultimate-config " + node.id + ": Microsoft AzureTTS service enabled.")
                try {
                    listVoicesAzure();
                } catch (error) {
                    RED.log.error('ttsultimate-config ' + node.id + ': listVoices: Error getting Microsoft Azure voices: ' + error.message);
                }

            } catch (error) {
                RED.log.warn("ttsultimate-config " + node.id + ": Microsoft AzureTTS service disabled. " + error.message)
            }
        } else {
            //RED.log.info("ttsultimate-config " + node.id + ": Microsoft AzureTTS service not used. ");
        }
        // #########################################

        //#endregion


        //#region HTTP ENDPOINTS
        // ######################################################
        // 21/03/2019 Endpoint for retrieving the default IP
        RED.httpAdmin.get("/ttsultimateGetEthAddress", RED.auth.needsPermission('TTSConfigNode.read'), function (req, res) {
            res.json(GetEthAddress());
        });
        function GetEthAddress() {
            var oiFaces = oOS.networkInterfaces();
            var jListInterfaces = [];
            try {
                Object.keys(oiFaces).forEach(ifname => {
                    // Interface with single IP
                    if (Object.keys(oiFaces[ifname]).length === 1) {
                        if (Object.keys(oiFaces[ifname])[0].internal == false) jListInterfaces.push({ name: ifname, address: Object.keys(oiFaces[ifname])[0].address });
                    } else {
                        var sAddresses = "";
                        oiFaces[ifname].forEach(function (iface) {
                            if (iface.internal == false && iface.family !== undefined && iface.family.toString().includes("4")) sAddresses = iface.address;
                        });
                        if (sAddresses !== "") jListInterfaces.push({ name: ifname, address: sAddresses });
                    }
                })
            } catch (error) { }
            if (jListInterfaces.length > 0) {
                return(jListInterfaces[0].address); // Retunr the first usable IP
            } else {
                return("NO ETH INTERFACE FOUND");
            }
        }
    
        // 20/03/2020 in the middle of coronavirus, get the sonos groups
        RED.httpAdmin.get("/sonosgetAllGroups", RED.auth.needsPermission('TTSConfigNode.read'), function (req, res) {
            var jListGroups = [];
            try {
                const discovery = new sonos.AsyncDeviceDiscovery()
                discovery.discover().then((device, model) => {
                    return device.getAllGroups().then((groups) => {
                        //RED.log.warn('Groups ' + JSON.stringify(groups, null, 2))
                        for (let index = 0; index < groups.length; index++) {
                            const element = groups[index];
                            jListGroups.push({ name: element.Name, host: element.host })
                        }
                        res.json(jListGroups)
                        //return groups[0].CoordinatorDevice().togglePlayback()
                    })
                }).catch(e => {
                    RED.log.warn('ttsultimate-config ' + node.id + ': Error in discovery ' + e);
                    res.json("ERRORDISCOVERY");
                })
            } catch (error) { }
        });


        // 09/03/2020 Get list of filenames in hailing folder
        RED.httpAdmin.get("/getHailingFilesList", RED.auth.needsPermission('TTSConfigNode.read'), function (req, res) {
            var jListOwnFiles = [];
            var sName = "";
            try {
                fs.readdirSync(path.join(node.TTSRootFolderPath, "hailingpermanentfiles")).forEach(file => {
                    if (file.indexOf("Hailing_") > -1) {
                        sName = file.replace("Hailing_", "").replace(".mp3", "");
                        jListOwnFiles.push({ name: sName, filename: file });
                    }
                });

            } catch (error) { }
            res.json(jListOwnFiles)
        });

        // 09/03/2020 Delete Hailing
        RED.httpAdmin.get("/deleteHailingFile", RED.auth.needsPermission('TTSConfigNode.read'), function (req, res) {
            // Delete the file
            try {
                var newPath = path.join(node.TTSRootFolderPath, "hailingpermanentfiles", req.query.FileName);
                fs.unlinkSync(newPath)
            } catch (error) { }
            res.json({ status: 220 });
        });

        // 09/03/2020 Receive new hailing files from html
        RED.httpAdmin.post("/ttsultimateHailing", function (req, res) {
            var form = new formidable.IncomingForm();
            form.parse(req, function (err, fields, files) {
                try {
                    if (files.customHailing.name.indexOf(".mp3") !== -1) {
                        var newPath = path.join(node.TTSRootFolderPath, "hailingpermanentfiles", "Hailing_" + files.customHailing.name);
                        // 30/12/2020 To avoid XDEV issue: oldpath and newpath are not on the same mounted filesystem. (Linux permits a filesystem to be mounted at multiple points, 
                        // but rename() does not work across different mount points, even if the same filesystem is mounted on both.)
                        // Instead of renaming it, i must copy the file and then delete the old one.
                        try {
                            fs.unlinkSync(newPath)
                        } catch (error) {
                        }
                        fs.copyFileSync(files.customHailing.path, newPath)
                        try {
                            fs.unlinkSync(files.customHailing.path);
                        } catch (error) {
                            // Don't care
                        }
                        res.json({ status: 220 });
                        res.end;
                    }
                } catch (error) {
                    RED.log.error("Upload Hailing " + error.message);
                    res.json({ status: 404, message: "Unable to write to the filesystem. PLEASE CHECK THAT THE USER RUNNING NODE-RED, HAS PERMISSIONS TO WRITE TO THE FILESYSTEM." });
                    res.end;
                }
            });
        });


        // 22/12/2020 Receive the google credential and on the fly set the environment path
        RED.httpAdmin.post("/ttsultimatesavegooglecredentialsfile", function (req, res) {
            var form = new formidable.IncomingForm();
            form.parse(req, function (err, fields, files) {
                if (err) { };
                // Allow only json
                if (files.googleCreds.name.indexOf(".json") !== -1) {
                    var newPath = path.join(node.TTSRootFolderPath, "ttsultimategooglecredentials", "googlecredentials.json");
                    // Set the environment variable
                    process.env.GOOGLE_APPLICATION_CREDENTIALS = newPath;
                    // 30/12/2020 To avoid XDEV issue: oldpath and newpath are not on the same mounted filesystem. (Linux permits a filesystem to be mounted at multiple points, 
                    // but rename() does not work across different mount points, even if the same filesystem is mounted on both.)
                    // Instead of renaming it, i must copy the file and then delete the old one.
                    try {
                        fs.unlinkSync(newPath)
                    } catch (error) {
                    }
                    fs.copyFileSync(files.googleCreds.path, newPath)
                    try {
                        fs.unlinkSync(files.googleCreds.path);
                    } catch (error) {
                        // Don't care
                    }
                }
            });
            res.json({ status: 220 });
            res.end;
        });

        // 26/10/2020 Supergiovane, get the updated voice list. 
        RED.httpAdmin.get("/ttsgetvoices" + encodeURIComponent(node.id), RED.auth.needsPermission('TTSConfigNode.read'), function (req, res) {
            var ttsservice = req.query.ttsservice;// Retrieve the ttsservice engine
            var jListVoices = [];

            // 23/12/2020 Based on tts service engine, return appropriate voice list
            if (ttsservice === "polly") {
                try {
                    // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Polly.html#describeVoices-property
                    var jfiltroVoci = {
                        //Engine: standard | neural,
                        //IncludeAdditionalLanguageCodes: true 
                        //LanguageCode: arb | cmn-CN | cy-GB | da-DK | de-DE | en-AU | en-GB | en-GB-WLS | en-IN | en-US | es-ES | es-MX | es-US | fr-CA | fr-FR | is-IS | it-IT | ja-JP | hi-IN | ko-KR | nb-NO | nl-NL | pl-PL | pt-BR | pt-PT | ro-RO | ru-RU | sv-SE | tr-TR,
                        //NextToken: "STRING_VALUE"
                    };
                    node.polly.describeVoices(jfiltroVoci, function (err, data) {
                        if (err) {
                            RED.log.warn('ttsultimate-config ' + node.id + ': Error getting polly voices ' + err);
                            jListVoices.push({ name: "Error retrieving voices. " + err + " Check cretentials, deploy and restart node-red.", id: "Ivy" })
                            res.json(jListVoices)
                        } else {
                            for (let index = 0; index < data.Voices.length; index++) {
                                const oVoice = data.Voices[index];
                                if (oVoice.hasOwnProperty("SupportedEngines")) {
                                    oVoice.SupportedEngines.forEach(voicetype => {
                                        jListVoices.push({ name: oVoice.LanguageName + " (" + oVoice.LanguageCode + ") " + oVoice.Name + " - " + oVoice.Gender + " - " + voicetype, id: oVoice.Id + "#engineType:" + voicetype })
                                    });
                                } else {
                                    jListVoices.push({ name: oVoice.LanguageName + " (" + oVoice.LanguageCode + ") " + oVoice.Name + " - " + oVoice.Gender, id: oVoice.Id })
                                }
                            }
                            res.json(jListVoices)
                        }
                    });

                } catch (error) {
                    jListVoices.push({ name: "Error " + error, id: "Ivy" })
                    res.json(jListVoices)
                }
            } else if (ttsservice === "googletts") {
                async function listVoices() {
                    try {
                        const [result] = await node.googleTTS.listVoices({});
                        const voices = result.voices;
                        voices.forEach(oVoice => {
                            oVoice.languageCodes.forEach(languageCode => {
                                jListVoices.push({ name: languageCode + " " + oVoice.name + " - " + oVoice.ssmlGender, id: oVoice.name + "#" + languageCode + "#" + oVoice.ssmlGender })
                            });
                        });
                        res.json(jListVoices)
                    } catch (error) {
                        RED.log.error('ttsultimate-config ' + node.id + ': Error getting google TTS voices ' + error.message + " Please deploy and restart node-red.");
                        jListVoices.push({ name: "Error getting Google TTS voices. " + error.message + " Check credentials, deploy and restart node-red.", id: "Ivy" })
                        res.json(jListVoices)
                    }
                };
                try {
                    listVoices();
                } catch (error) {
                    RED.log.error('ttsultimate-config ' + node.id + ': listVoices: Error getting google TTS voices ' + error.message + " Please deploy and restart node-red.");
                }

            } else if (ttsservice === "googletranslate") {
                async function listVoices() {
                    try {
                        const voices = node.googleTranslateTTS.voices;
                        voices.forEach(oVoice => {
                            jListVoices.push({ name: oVoice.name + " - " + oVoice.code, id: oVoice.code })
                        });
                        res.json(jListVoices)
                    } catch (error) {
                        RED.log.error('ttsultimate-config ' + node.id + ': Error getting google Translate voices ' + error.message);
                        jListVoices.push({ name: "Error getting Google Translate voices. " + error.message + " Deploy and restart node-red.", id: "Ivy" })
                        res.json(jListVoices)
                    }
                };
                try {
                    listVoices();
                } catch (error) {
                    RED.log.error('ttsultimate-config ' + node.id + ': listVoices: Error getting google Translate voices ' + error.message + " Please deploy and restart node-red.");
                }

            } else if (ttsservice === "microsoftazuretts") {
                res.json(node.microsoftAzureTTSVoiceList);
            }
        });

        // ########################################################
        //#endregion

        //#region OWNFILE NODE HTTP ENDPOINTS
        // ######################################################

        // Receive new files from html
        RED.httpAdmin.post("/ttsultimateOwnFile", function (req, res) {
            var form = new formidable.IncomingForm();
            form.parse(req, function (err, fields, files) {
                if (err) { };
                // Allow only mp3
                try {
                    if (files.customTTS.name.indexOf(".mp3") !== -1) {
                        var newPath = path.join(node.TTSRootFolderPath, "ttspermanentfiles", "OwnFile_" + files.customTTS.name);
                        // 30/12/2020 To avoid XDEV issue: oldpath and newpath are not on the same mounted filesystem. (Linux permits a filesystem to be mounted at multiple points, 
                        // but rename() does not work across different mount points, even if the same filesystem is mounted on both.)
                        // Instead of renaming it, i must copy the file and then delete the old one.
                        try {
                            fs.unlinkSync(newPath)
                        } catch (error) {
                        }
                        fs.copyFileSync(files.customTTS.path, newPath)
                        try {
                            fs.unlinkSync(files.customTTS.path);
                        } catch (error) {
                            // Don't care
                        }
                        res.json({ status: 220 });
                        res.end;
                    }
                } catch (error) {
                    RED.log.error("OwnFile " + error.message);
                    res.json({ status: 404, message: "Unable to write to the filesystem. PLEASE CHECK THAT THE USER RUNNING NODE-RED, HAS PERMISSIONS TO WRITE TO THE FILESYSTEM." });
                    res.end;
                }
            });
        });

        // 27/02/2020 Get list of filenames starting with OwnFile_
        RED.httpAdmin.get("/getOwnFilesList", RED.auth.needsPermission('TTSConfigNode.read'), function (req, res) {
            var jListOwnFiles = [];
            var sName = "";
            try {
                fs.readdirSync(path.join(node.TTSRootFolderPath, "ttspermanentfiles")).forEach(file => {
                    if (file.indexOf("OwnFile_") > -1) {
                        sName = file.replace("OwnFile_", '').replace(".mp3", '');
                        jListOwnFiles.push({ name: sName, filename: file });
                    }
                });

            } catch (error) { }
            res.json(jListOwnFiles)
        });

        // 27/02/2020 Delete OwnFile_
        RED.httpAdmin.get("/deleteOwnFile", RED.auth.needsPermission('TTSConfigNode.read'), function (req, res) {
            try {
                if (req.query.FileName == "DELETEallFiles") {
                    // Delete all OwnFiles_
                    try {
                        fs.readdir(path.join(node.TTSRootFolderPath, "ttspermanentfiles"), (err, files) => {
                            files.forEach(function (file) {
                                if (file.indexOf("OwnFile_") !== -1) {
                                    RED.log.warn("ttsultimate-config " + node.id + ": Deleted file " + path.join(node.TTSRootFolderPath, "ttspermanentfiles", file));
                                    try {
                                        fs.unlinkSync(path.join(node.TTSRootFolderPath, "ttspermanentfiles", file));
                                    } catch (error) { }
                                }
                            });
                        });

                    } catch (error) { }
                } else {
                    // Delete only one file
                    try {
                        var newPath = path.join(node.TTSRootFolderPath, "ttspermanentfiles", req.query.FileName);
                        try {
                            fs.unlinkSync(newPath)
                        } catch (error) { }

                    } catch (error) { }
                }
            } catch (err) {
            }
            res.json({ status: 220 });
        });
        // ########################################################
        //#endregion

        node.oWebserver; // 11/11/2019 Stores the Webserver
        node.purgediratrestart = config.purgediratrestart || "leave"; // 26/02/2020
        node.noderedport = typeof config.noderedport === "undefined" ? "1980" : config.noderedport;
        // 11/11/2019 NEW in V 1.1.0, changed webserver behaviour. Redirect pre V. 1.1.0 1880 ports to the nde default 1980
        if (node.noderedport.trim() == "1880") {
            RED.log.warn("ttsultimate-config " + node.id + ": The webserver port ist 1880. Please change it to another port, not to conflict with default node-red 1880 port. I've changed this temporarly for you to 1980");
            node.noderedport = "1980";
        }
        node.sNoderedURL = "http://" + node.noderedipaddress.trim() + ":" + node.noderedport.trim(); // 11/11/2019 New Endpoint to overcome https problem.
        RED.log.info('ttsultimate-config ' + node.id + ': Node-Red node.js Endpoint will be created here: ' + node.sNoderedURL + "/tts");

        // 26/02/2020
        if (node.purgediratrestart === "purge") {
            // Delete all files, that are'nt OwnFiles_
            try {
                let files = fs.readdirSync(path.join(node.TTSRootFolderPath, "ttsfiles"));
                try {
                    if (files.length > 0) {
                        files.forEach(function (file) {
                            RED.log.info("ttsultimate-config " + node.id + ": Deleted TTS file " + path.join(node.TTSRootFolderPath, "ttsfiles", file));
                            try {
                                fs.unlinkSync(path.join(node.TTSRootFolderPath, "ttsfiles", file));
                            } catch (error) {
                            }
                        });
                    };
                } catch (error) { }


            } catch (error) { }
        };




        // 11/11/2019 CREATE THE ENDPOINT
        // #################################
        const http = require('http')
        const sWebport = node.noderedport.trim();
        const requestHandler = (req, res) => {
            try {

                var url = require('url');
                var url_parts = url.parse(req.url, true);
                var query = url_parts.query;

                res.setHeader('Content-Disposition', 'attachment; filename=tts.mp3')
                if (fs.existsSync(query.f.toString())) {
                    // 26/01/2021 security check
                    // File should be something like mydocs/.node-red/sonospollyttsstorage/ttsfiles/Hello_de-DE.mp3
                    if (path.extname(query.f.toString()) === ".mp3" && path.dirname(path.dirname(query.f.toString())).endsWith("sonospollyttsstorage")) {
                        var readStream = fs.createReadStream(query.f.toString());
                        readStream.on("error", function (error) {
                            RED.log.error("ttsultimate-config " + node.id + ": Playsonos error opening stream : " + query.f.toString() + ' : ' + error);
                            res.end();
                            return;
                        });
                        readStream.pipe(res);
                    } else {
                        res.write("NOT ALLOWED");
                        res.end();
                    }

                    // http://localhost:1980/tts?f=/etc/passwd                 

                } else {
                    RED.log.error("ttsultimate-config " + node.id + ": Playsonos RED.httpAdmin file not found: " + query.f);
                    res.write("File not found");
                    res.end();
                }

            } catch (error) {
                RED.log.error("ttsultimate-config " + node.id + ": Playsonos RED.httpAdmin error: " + error + " on: " + query.f);
                res.end();
            }

        }


        try {
            node.oWebserver = http.createServer(requestHandler);
            node.oWebserver.on('error', function (e) {
                RED.log.error("ttsultimate-config " + node.id + ": " + node.ID + " error starting webserver on port " + sWebport + " " + e);
            });
        } catch (error) {
            // Already open. Close it and redo.
            RED.log.error("ttsultimate-config " + node.id + ": Webserver creation error: " + error);
        }

        try {
            node.oWebserver.listen(sWebport, (err) => {
                if (err) {
                    RED.log.error("ttsultimate-config " + node.id + ": error listening webserver on port " + sWebport + " " + err);
                }
            });

        } catch (error) {
            // In case oWebserver is null
            RED.log.error("ttsultimate-config " + node.id + ": error listening webserver on port " + sWebport + " " + error);
        }
        // #################################




        node.on('close', function (done) {
            // 11/11/2019 Close the Webserver
            try {
                node.oWebserver.close(function () { RED.log.info("ttsultimate-config " + node.id + ": Webserver UP. Closing down."); });
            } catch (error) {

            }
            let t = setTimeout(function () {
                // Wait some time to allow time to do promises.
                done();
            }, 500);
        });


    }
    RED.nodes.registerType("ttsultimate-config", TTSConfigNode, {
        credentials: {
            accessKey: { type: "text" },
            secretKey: { type: "password" },
            mssubscriptionKey: { type: "text" },
            mslocation: { type: "text" }
        }
    });

}

