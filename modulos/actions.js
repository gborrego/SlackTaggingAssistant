
class actions {

    constructor() {
        this.axios = require('axios');
        this.qs = require('querystring');
        this.config = require('../config/config');
        this.apiUrl = "https://slack.com/api";
        this.fs = require('fs');
    }

    async select(reqBody){

        let tags = await this.getAllTags();

        let word = reqBody.value;

        //Este es el json con las opciones que carga el select del dialog
        let select = this.formatJson(tags);

        //si la palabra no es una cadena vacia entonces se hace el filtro para mostrar las nuevas opciones
        if (word != '') {

            let opciones = select.option_groups;

            //Template para las opciones
            let template = {
                option_groups: []
            };

            //Busca las coincidencias con la palabra escrita
            for (let index = 0; index < opciones.length; index++) {
                let filtro = opciones[index].options.filter((valor) => {
                    return valor.value.toLowerCase().substring(0, word.length) == word.toLowerCase();
                });
                if (filtro.length != 0) {
                    template.option_groups.push({
                        label: opciones[index].label,
                        options: filtro
                    });
                }
            }
            return template;

        } else {
            //Si la palabra es vacia regresa la lista completa de opciones
            return select;
        }

    }

    formatJson(json){

        let format = {option_groups: []};
        let general = {"label": "General", "options": []};

        for (const tag of json) {
            if(tag.isMetaTag){
                let temp = {"label": tag.nombre, "options": []};
                
                for (const hijo of json) {
                    if(hijo.parentId == tag._id){
                        temp.options.push({"label": hijo.nombre, "value": hijo.nombre});
                    } 
                }
                format.option_groups.push(temp);
            } 
        }

        for (let index = 0; index < format.option_groups.length; index++) {
            if(format.option_groups[index].options.length == 0){
                format.option_groups.splice(index, 1);
                index--;
            }
        }

        for (const tag of json) {
            if(!(this.getHijos(json, tag._id)) && tag.parent == null){
                general.options.push({"label": tag.nombre, "value": tag.nombre})
            }
        }
        format.option_groups.push(general);
        return format;
    }

    getHijos(json, id){
        for (const tag of json) {
            if(id == tag.parentId){
                return true;
            }
        }
        return false;
    }

    async getAllTags(){
        return new Promise((resolve, reject) =>{
            this.axios.get(`${this.config.tagsurl}`).then((result) => {
                resolve(result.data);
            }).catch((err) => {
                //console.log(err);
                reject(err);
            });
        })
    }

    async processRequest(reqBody) {

        let messageType = reqBody.type;

        //console.log(reqBody);

        if (messageType == 'message_action') {
            //Obtenemos el trigger id de la request para poder mostrar el Dialog
            var trigger_id = reqBody.trigger_id;

            var msg = reqBody.message;
            var chnl = reqBody.channel;
            var usr = reqBody.user;
            var opents = reqBody.action_ts;

            let sugeridas = await this.getSugeridas(msg.text);
            let options_s = [];
            for (const tag of sugeridas) {
                options_s.push({"label":tag, "value":tag});
            }

            var st = JSON.stringify({
                message: msg,
                channel: chnl,
                user: usr,
                open: opents,
                sugeridas: sugeridas
            });

            //Creamos las configuraciones del Dialog, los tags se cargan desde una fuente externa
            var dialog = {
                token: this.config.TOKEN,
                trigger_id,
                dialog: JSON.stringify({
                    title: 'Etiqueta un mensaje!',
                    callback_id: 'tag',
                    submit_label: 'Tag!',
                    state: st,
                    elements: [
                        {
                            label: 'Busca un tag...',
                            type: 'select',
                            name: 'tag',
                            optional: true,
                            data_source: "external"
                        },
                        {
                            label: 'No encontraste tu tag? utiliza uno propio!',
                            type: 'text',
                            name: 'tag2',
                            optional: true,
                            max_length: 20,
                            placeholder: 'No es necesario utilizar # :)'
                        },{
                            label: 'Etiquetas sugeridas',
                            type: 'select',
                            name: 'tag3',
                            optional: true,
                            options: options_s
                        }
                    ],
                }),
            };

            /*
            Realizamos un Post Request a la api de slack para utilizar el metodo dialog.open y enviarle las
            configuraciones del dialog creado anteriormente
            */
            this.axios.post(`${this.apiUrl}/dialog.open`, this.qs.stringify(dialog))
                .then((result) => {
                    console.log(result.data);
                }).catch((err) => {
                    console.log("Error, trigger timeout");
                });
        }

        //Una vez que el usuario seleccionó un tag se crea una accion de dialog_submission

        if (messageType == 'dialog_submission') {

            let estado = JSON.parse(reqBody.state);

            if ((reqBody.submission.tag != null || reqBody.submission.tag2 != null || reqBody.submission.tag3 != null)) {

                let user1 = await this.searchUser(estado.message.user);
                let user2 = await this.searchUser(estado.user.id);

                let finalTag = '';
                let newText = estado.message.text;

                let tag1 = reqBody.submission.tag;
                let tag2 = reqBody.submission.tag2;
                let tag3 = reqBody.submission.tag3;

                if(tag1 != null){
                    finalTag += " #"
                    finalTag += tag1;
                    //finalTag += " "
                }
                
                if(tag2 != null){
                    let tg = tag2.split(" ");
                    console.log(tg);
                    for(let t of tg){
                        finalTag += " #"
                        finalTag += t;
                    } 
                }

                if(tag3 != null){
                    finalTag += " #"
                    finalTag += tag3;
                }

                newText += finalTag;

                let attach = [
                    {
                        id: 1,
                        text: newText,
                        color: '#3964db',
                        fields: [
                            {
                                title: "Mensaje de: ",
                                value: user1.user.real_name,
                                short: true
                            },
                            {
                                title: "Etiquetado por: ",
                                value: user2.user.real_name,
                                short: true
                            },
                            {
                                title: "Tag(s)",
                                value: finalTag,
                                short: true
                            }
                        ],
                        ts: estado.message.ts
                    }
                ];

                let post = {
                    token: this.config.TOKEN,
                    channel: estado.channel.id,
                    text: 'New tagged message!',
                    attachments: JSON.stringify(attach)
                }

                this.postMessage(post);

                let st = JSON.parse(reqBody.state)

                let datos = {
                    etiquetado_por: user2.user.real_name,
                    canal: estado.channel.id,
                    mensaje: newText,
                    sugeridas: st.sugeridas,
                    open: st.open,
                    close: reqBody.action_ts,
                    usada: reqBody.submission.tag
                }

                this.guardar_json(datos);

            } else {
                this.postError(estado);
            }


        }


    }

    //Metodo para buscar usuarios

    guardar_json(datos){
        return new Promise((resolve, reject) => {
            this.fs.exists('myjson.json', (exists) =>{
                console.log(exists)
                if(exists){
                    this.fs.readFile('myjson.json', 'utf8', function readFileCallback(err, data){
                        if (err){
                            throw err;
                        } else {
                        let array = [];
                        let obj = JSON.parse(data);
                        for (let i = 0; i < obj.length; i++) {
                            array.push(obj[i]);
                        }
                        array.push(datos);
                        let json = JSON.stringify(array);
                        let fs = require('fs');
                        fs.writeFile('myjson.json', json, (err) => {
                            if(err) throw err;
                        }); 
                        
                    }});
                } else {
                    let json = JSON.stringify(datos);
                    this.fs.writeFile('myjson.json', json, (err) => {
                        if(err) throw err;
                    }); 
                }
            });
            
            
            
        });
    }

    async searchUser(usrID) {
        return new Promise((resolve, reject) =>{
            let find = {
                token: this.config.TOKEN,
                user: usrID
            }
            this.axios.post(`${this.apiUrl}/users.info`, this.qs.stringify(find))
                .then((result) => {
                    resolve(result.data);
                }).catch((err) => {
                    reject(err);
                });
        });    
    }

    //Método para obtener etiquetas sugeridas
    async getSugeridas(text){
        return new Promise((resolve, reject) => {
            this.axios.post(`${this.config.serverurl}/hot`, {text: text})
            .then((result)=>{
                console.log(result.data);

                let arr = []
                for (const tag of result.data) {
                    if(tag == "ModelhistoriaUser") arr.push("HistoriaUsuario")
                    if(tag == "Modeltestdata") arr.push("DataTest")
                    if(tag == "Modelrecursorest") arr.push("RecursoRest")
                    if(tag == "Modeldocumentation") arr.push("Documentacion")
                    if(tag == "Modeltechonologicalsupport") arr.push("SoporteTecnologico")
                    if(tag == "Modelpruebarest") arr.push("PruebaREST")
                    if(tag == "Modelangularcifrado") arr.push("AngularCifrado")
                }

                resolve(arr);
            })
            .catch((err) =>{
                console.log(err.message);
            });
        });
    }

    //Metodo para publicar los mensajes en Slack
    async postMessage(post) {
        this.axios.post(`${this.apiUrl}/chat.postMessage`, this.qs.stringify(post))
            .then((result) => {
                console.log("Posted");
            }).catch((err) => {
                console.log(err);
            });
    }

    async postError(estado) {

        let post = {
            token: this.config.TOKEN,
            channel: estado.channel.id,
            text: 'No seleccionaste ningun tag :('
        }

        this.postMessage(post);
    }


}

module.exports = actions;