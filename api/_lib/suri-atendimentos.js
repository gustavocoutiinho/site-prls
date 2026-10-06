const { createHash } = require('node:crypto');
const CANAL = 'wp685312314657220';
function filtroAtendimentos(inicio, fim) {
  const valido = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
  if (!valido(inicio) || !valido(fim) || fim < inicio || (Date.parse(fim)-Date.parse(inicio)) / 86400000 > 30) throw Object.assign(new Error('Período inválido'), { status: 400 });
  return {startDate:inicio,endDate:fim,channelId:CANAL,getCurrent:false,useBusinessHours:false};
}
function normalizarAtendimentos(resultado) {
  const lista=Array.isArray(resultado)?resultado:resultado.data;
  if (!Array.isArray(lista)) throw new Error('Formato de atendimentos inválido');
  return lista.map(a=>{
    const u=a.user;
    if (!u || u.channelId!==CANAL || !String(u.id).startsWith(CANAL+':') || !a.protocol || !a.startDate || !a.endDate) throw new Error('Atendimento fora do canal ou sem identidade');
    const id=createHash('sha256').update(JSON.stringify([u.id,String(a.protocol),a.startDate,a.attendantId||''])).digest('hex');
    return {id,contato_id:u.id,channelId:CANAL,protocol:String(a.protocol),requestDate:a.requestDate,startDate:a.startDate,endDate:a.endDate,attendantId:a.attendantId,attendantName:a.attendantName,departmentId:a.departmentId,departmentName:a.departmentName,status:a.status,reason:a.reason,waitingTime:a.waitingTime,attendanceTime:a.attendanceTime,avgResponseTime:a.avgResponseTime,surveyGrade:a.surveyGrade,isTransferred:a.isTransferred};
  });
}
module.exports={filtroAtendimentos,normalizarAtendimentos};
