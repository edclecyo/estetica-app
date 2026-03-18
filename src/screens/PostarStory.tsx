import React, { useState } from "react";
import {
View,
Text,
TouchableOpacity,
StyleSheet,
Image,
ActivityIndicator,
Alert
} from "react-native";

import { launchImageLibrary } from "react-native-image-picker";

import storage from "@react-native-firebase/storage";
import firestore from "@react-native-firebase/firestore";

import { useRoute, useNavigation } from "@react-navigation/native";

export default function PostarStory(){

const route = useRoute<any>()
const navigation = useNavigation<any>()

const { estabelecimentoId } = route.params

const [img,setImg] = useState<string | null>(null)
const [uploading,setUploading] = useState(false)

const escolherImagem = async ()=>{

const res = await launchImageLibrary({
mediaType:"photo",
quality:0.8
})

if(res.assets && res.assets.length > 0){
setImg(res.assets[0].uri || null)
}

}

const postarStory = async ()=>{

if(!img){
Alert.alert("Selecione uma imagem")
return
}

try{

setUploading(true)

const fileName = `story_${Date.now()}.jpg`

const ref = storage().ref(`stories/${estabelecimentoId}/${fileName}`)

await ref.putFile(img)

const url = await ref.getDownloadURL()

const agora = Date.now()

await firestore()
.collection("stories")
.add({

estabelecimentoId,

image:url,

createdAt:agora,

expiresAt:agora + 86400000,

views:0

})

Alert.alert("Story publicado!")

navigation.goBack()

}catch(e){

Alert.alert("Erro ao postar")

}

setUploading(false)

}

return(

<View style={s.container}>

<Text style={s.title}>Postar Story</Text>

<TouchableOpacity
style={s.pickBtn}
onPress={escolherImagem}
>

<Text style={s.pickText}>
Selecionar imagem
</Text>

</TouchableOpacity>

{img && (

<Image
source={{uri:img}}
style={s.preview}
/>

)}

<TouchableOpacity
style={s.postBtn}
onPress={postarStory}
disabled={uploading}
>

{uploading
? <ActivityIndicator color="#111"/>
: <Text style={s.postText}>Publicar Story</Text>
}

</TouchableOpacity>

</View>

)

}

const s = StyleSheet.create({

container:{
flex:1,
backgroundColor:"#0D0D0D",
padding:20,
justifyContent:"center"
},

title:{
color:"#F2EDE4",
fontSize:20,
fontWeight:"700",
marginBottom:30,
textAlign:"center"
},

pickBtn:{
backgroundColor:"#222",
padding:16,
borderRadius:12,
alignItems:"center",
marginBottom:20
},

pickText:{
color:"#F2EDE4"
},

preview:{
width:"100%",
height:300,
borderRadius:14,
marginBottom:20
},

postBtn:{
backgroundColor:"#C9A96E",
padding:16,
borderRadius:12,
alignItems:"center"
},

postText:{
color:"#111",
fontWeight:"700"
}

})