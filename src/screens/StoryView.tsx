import React, { useEffect, useState, useRef } from "react";
import {
View,
Text,
TouchableOpacity,
StyleSheet,
Dimensions,
Image,
Animated
} from "react-native";

import firestore from "@react-native-firebase/firestore";
import auth from "@react-native-firebase/auth";
import { useRoute, useNavigation } from "@react-navigation/native";

const { width } = Dimensions.get("window");

export default function StoryView(){

const route:any = useRoute();
const navigation:any = useNavigation();

const { stories, startIndex } = route.params;

const [index,setIndex] = useState(startIndex || 0);
const [likes,setLikes] = useState(0);

const progress = useRef(new Animated.Value(0)).current;

const story = stories[index];

useEffect(()=>{

if(!story) return;

registrarView();

Animated.timing(progress,{
toValue:1,
duration:5000,
useNativeDriver:false
}).start(()=>{

proximo();

});

},[index]);

async function registrarView(){

try{

await firestore()
.collection("storyViews")
.add({
storyId:story.id,
userId:auth().currentUser?.uid || "anon",
timestamp:Date.now()
});

}catch(e){}

}

async function curtir(){

setLikes(likes+1);

try{

await firestore()
.collection("storyLikes")
.add({
storyId:story.id,
userId:auth().currentUser?.uid,
timestamp:Date.now()
});

}catch(e){}

}

function proximo(){

if(index + 1 >= stories.length){
navigation.goBack();
return;
}

progress.setValue(0);
setIndex(index+1);

}

function voltar(){

if(index === 0) return;

progress.setValue(0);
setIndex(index-1);

}

return(

<View style={s.container}>

{/* PROGRESS BAR */}

<View style={s.progressContainer}>

{stories.map((_:any,i:number)=>{

return(

<View key={i} style={s.progressBg}>

{i === index && (

<Animated.View
style={[
s.progressFill,
{
width:progress.interpolate({
inputRange:[0,1],
outputRange:["0%","100%"]
})
}
]}
/>

)}

{i < index && <View style={[s.progressFill,{width:"100%"}]} />}

</View>

);

})}

</View>

{/* STORY */}

{story?.imagem && (

<Image
source={{uri:story.imagem}}
style={s.image}
/>

)}

{/* AREA DE TOQUE */}

<View style={s.touchLayer}>

<TouchableOpacity
style={{flex:1}}
onPress={voltar}
/>

<TouchableOpacity
style={{flex:1}}
onPress={proximo}
/>

</View>

{/* INFO */}

<View style={s.footer}>

<Text style={s.nome}>
{story.nome}
</Text>

<TouchableOpacity
style={s.likeBtn}
onPress={curtir}
>

<Text style={s.likeText}>
❤️ Curtir
</Text>

</TouchableOpacity>

</View>

</View>

);

}

const s = StyleSheet.create({

container:{
flex:1,
backgroundColor:"#000",
justifyContent:"center",
alignItems:"center"
},

image:{
width:"100%",
height:"100%",
position:"absolute"
},

touchLayer:{
position:"absolute",
flexDirection:"row",
width:"100%",
height:"100%"
},

footer:{
position:"absolute",
bottom:40,
width:"100%",
alignItems:"center"
},

nome:{
color:"#fff",
fontSize:18,
fontWeight:"700",
marginBottom:10
},

likeBtn:{
backgroundColor:"#ff2d55",
paddingHorizontal:20,
paddingVertical:10,
borderRadius:30
},

likeText:{
color:"#fff",
fontWeight:"700"
},

progressContainer:{
position:"absolute",
top:50,
flexDirection:"row",
width:"90%"
},

progressBg:{
flex:1,
height:4,
backgroundColor:"rgba(255,255,255,0.3)",
marginHorizontal:2,
borderRadius:2
},

progressFill:{
height:4,
backgroundColor:"#fff",
borderRadius:2
}

});