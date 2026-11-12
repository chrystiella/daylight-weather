import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Compass, Droplets, LocateFixed, MapPin, Moon, Search, Sun, Sunrise, Sunset, Thermometer, Wind, X, LoaderCircle } from 'lucide-react'

type Place = { id?: number; name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone?: string; isCurrentLocation?: boolean }
type CurrentWeather = { time: string; temperature_2m: number; relative_humidity_2m: number; apparent_temperature: number; is_day: number; precipitation: number; weather_code: number; wind_speed_10m: number; wind_direction_10m: number; uv_index: number }
type Forecast = { current: CurrentWeather; hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[]; is_day: number[] }; daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; sunrise: string[]; sunset: string[]; precipitation_probability_max: number[] }; timezone: string }
type GeoResult = { id: number; name: string; admin1?: string; country?: string; latitude: number; longitude: number; timezone?: string }
const STORAGE_KEY = 'daylight-weather-place-v1'
const UNIT_KEY = 'daylight-weather-unit-v1'

function weatherLabel(code: number, isDay = 1) {
  if (code === 0) return isDay ? 'Clear sky' : 'Clear night'
  if (code === 1) return 'Mainly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Foggy'
  if ([51,53,55,56,57].includes(code)) return 'Drizzle'
  if ([61,63,65,66,67,80,81,82].includes(code)) return 'Rain showers'
  if ([71,73,75,77,85,86].includes(code)) return 'Snow'
  if ([95,96,99].includes(code)) return 'Thunderstorms'
  return 'Cloudy'
}
function WeatherGlyph({code,isDay=1,size=24}:{code:number;isDay?:number;size?:number}) {
  const common={size,strokeWidth:1.6}
  if(code===0) return isDay?<Sun {...common}/>:<Moon {...common}/>
  if(code===1||code===2) return <CloudSun {...common}/>
  if(code===45||code===48) return <CloudFog {...common}/>
  if([51,53,55,56,57].includes(code)) return <CloudDrizzle {...common}/>
  if([61,63,65,66,67,80,81,82].includes(code)) return <CloudRain {...common}/>
  if([71,73,75,77,85,86].includes(code)) return <CloudSnow {...common}/>
  if([95,96,99].includes(code)) return <CloudLightning {...common}/>
  if(code===3) return <Cloud {...common}/>
  return <CloudSun {...common}/>
}
function toF(c:number){return Math.round(c*9/5+32)}
function formatClock(time:string){const [h,m]=time.split('T')[1]?.split(':')||['0','0'];const d=new Date();d.setHours(Number(h),Number(m),0,0);return new Intl.DateTimeFormat(undefined,{hour:'numeric'}).format(d)}
function formatDay(date:string,index:number){if(index===0)return'Today';if(index===1)return'Tomorrow';return new Intl.DateTimeFormat(undefined,{weekday:'short'}).format(new Date(`${date}T12:00:00`))}
function locationLine(place:Place){return [place.name,place.admin1,place.country].filter(Boolean).join(', ')}

export default function App(){
  const [place,setPlace]=useState<Place|null>(()=>{try{const saved=localStorage.getItem(STORAGE_KEY);return saved?JSON.parse(saved) as Place:null}catch{return null}})
  const [forecast,setForecast]=useState<Forecast|null>(null)
  const [status,setStatus]=useState<'idle'|'loading'|'ready'|'error'>('idle')
  const [error,setError]=useState('')
  const [units,setUnits]=useState<'C'|'F'>(()=>{try{return localStorage.getItem(UNIT_KEY)==='C'?'C':'F'}catch{return'F'}})
  const [query,setQuery]=useState('')
  const [results,setResults]=useState<GeoResult[]>([])
  const [searching,setSearching]=useState(false)
  const [searchError,setSearchError]=useState('')
  const [geoLoading,setGeoLoading]=useState(false)
  const [now,setNow]=useState(new Date())

  useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60_000);return()=>window.clearInterval(timer)},[])
  useEffect(()=>{
    if(!place){setForecast(null);setStatus('idle');return}
    let cancelled=false
    const load=async()=>{
      setStatus('loading');setError('')
      const params=new URLSearchParams({latitude:String(place.latitude),longitude:String(place.longitude),current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,uv_index',hourly:'temperature_2m,precipitation_probability,weather_code,is_day',daily:'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',forecast_days:'7',timezone:'auto',temperature_unit:'celsius',wind_speed_unit:'kmh',precipitation_unit:'mm'})
      try{const response=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);if(!response.ok)throw new Error('The forecast service is unavailable. Try again in a moment.');const data=await response.json() as Forecast;if(cancelled)return;setForecast(data);setStatus('ready');localStorage.setItem(STORAGE_KEY,JSON.stringify(place))}
      catch(e){if(cancelled)return;setError(e instanceof Error?e.message:'Could not load the forecast. Check your connection and try again.');setStatus('error')}
    }
    void load();return()=>{cancelled=true}
  },[place])
  useEffect(()=>{
    const term=query.trim();if(term.length<2){setResults([]);setSearchError('');return}
    const controller=new AbortController();const timer=window.setTimeout(async()=>{
      setSearching(true);setSearchError('')
      try{const params=new URLSearchParams({name:term,count:'7',language:'en',format:'json'});const response=await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`,{signal:controller.signal});if(!response.ok)throw new Error('Could not search locations. Try again.');const data=await response.json() as {results?:GeoResult[]};setResults(data.results||[])}
      catch(e){if(!controller.signal.aborted)setSearchError(e instanceof Error?e.message:'Location search failed.')}
      finally{if(!controller.signal.aborted)setSearching(false)}
    },300)
    return()=>{window.clearTimeout(timer);controller.abort()}
  },[query])

  function choosePlace(result:GeoResult){setPlace({id:result.id,name:result.name,admin1:result.admin1,country:result.country,latitude:result.latitude,longitude:result.longitude,timezone:result.timezone});setQuery('');setResults([]);setSearchError('')}
  function useMyLocation(){
    if(!navigator.geolocation){setError('Location services are not available in this browser. Search for a city instead.');return}
    setGeoLoading(true);setError('')
    navigator.geolocation.getCurrentPosition(position=>{setPlace({name:'Your location',latitude:position.coords.latitude,longitude:position.coords.longitude,isCurrentLocation:true});setGeoLoading(false)},()=>{setGeoLoading(false);setError('We couldn’t access your location. Allow location access or search for a city.')},{enableHighAccuracy:false,timeout:12000,maximumAge:300000})
  }
  function clearPlace(){localStorage.removeItem(STORAGE_KEY);setPlace(null);setForecast(null);setStatus('idle')}
  function toggleUnits(){const next=units==='F'?'C':'F';setUnits(next);try{localStorage.setItem(UNIT_KEY,next)}catch{}}

  const hourly=useMemo(()=>{if(!forecast)return[];const start=Math.max(0,forecast.hourly.time.findIndex(t=>t>=forecast.current.time));return forecast.hourly.time.slice(start,start+12).map((time,i)=>({time,temp:forecast.hourly.temperature_2m[start+i],rain:forecast.hourly.precipitation_probability[start+i]??0,code:forecast.hourly.weather_code[start+i],isDay:forecast.hourly.is_day[start+i]??1}))},[forecast])
  const temp=(c:number)=>units==='C'?Math.round(c):toF(c)
  const wind=(kmh:number)=>units==='C'?Math.round(kmh):Math.round(kmh/1.609)
  const windLabel=units==='C'?'km/h':'mph'
  const current=forecast?.current
  const greeting=now.getHours()<12?'Good morning':now.getHours()<18?'Good afternoon':'Good evening'
  const dateLabel=new Intl.DateTimeFormat(undefined,{weekday:'long',month:'long',day:'numeric'}).format(now)

  return <div className="weather-app">
    <header className="weather-topbar"><a className="weather-brand" href="#top" aria-label="Daylight home"><span className="brand-sun"><Sun size={18}/></span><span>daylight<span className="brand-period">.</span></span></a><div className="topbar-center"><div className="search-wrap"><Search size={17}/><input aria-label="Search a city" placeholder="Search city or ZIP code" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&results[0])choosePlace(results[0]);if(e.key==='Escape'){setQuery('');setResults([])}}}/>{searching&&<LoaderCircle className="spin" size={16}/ >}{query&&<button className="search-clear" aria-label="Clear search" onClick={()=>{setQuery('');setResults([])}}><X size={14}/></button>}
      {query.trim().length>=2&&(results.length>0||searchError||(!searching&&query.trim().length>=2))&&<div className="search-results">{results.map(item=><button key={item.id} onClick={()=>choosePlace(item)}><MapPin size={15}/><span><b>{item.name}</b><small>{[item.admin1,item.country].filter(Boolean).join(', ')}</small></span><span className="result-arrow">↗</span></button>)}{searchError&&<p className="search-message">{searchError}</p>}{!searching&&!searchError&&!results.length&&<p className="search-message">No places found. Try another spelling.</p>}</div>}
    </div></div><div className="topbar-actions"><button className={`unit-toggle ${units==='C'?'c-selected':''}`} onClick={toggleUnits} aria-label={`Switch to degrees ${units==='C'?'Fahrenheit':'Celsius'}`}><span className={units==='C'?'selected':''}>°C</span><i/> <span className={units==='F'?'selected':''}>°F</span></button><button className="location-button" onClick={useMyLocation} disabled={geoLoading}>{geoLoading?<LoaderCircle size={16} className="spin"/>:<LocateFixed size={16}/>}<span>{geoLoading?'Finding you':'Use my location'}</span></button></div></header>
    <main id="top" className="weather-main">
      <section className="intro-row"><div><div className="section-kicker"><span/> YOUR LOCAL FORECAST</div><h1>{place?greeting:'Weather, wherever you are.'}</h1><p>{place?`${dateLabel} · ${place.timezone||'Local time'}`:'A little clarity for the day ahead.'}</p></div>{place&&<div className="place-chip"><MapPin size={15}/><span>{locationLine(place)}</span><button onClick={clearPlace} title="Clear saved location" aria-label="Clear saved location"><X size={14}/></button></div>}</section>
      {error&&<div className="notice error-notice"><span>{error}</span>{status==='error'&&place&&<button onClick={()=>setPlace({...place})}>Try again</button>}</div>}
      {!place?<section className="welcome-weather"><div className="welcome-sky"><div className="sky-orbit orbit-one"/><div className="sky-orbit orbit-two"/><div className="sky-sun"><Sun size={62} strokeWidth={1.1}/></div><div className="sky-cloud cloud-one"><Cloud size={72} strokeWidth={1.1}/></div><div className="sky-cloud cloud-two"><Cloud size={44} strokeWidth={1.1}/></div><span className="sky-star star-one">✳</span><span className="sky-star star-two">✳</span></div><div className="welcome-weather-copy"><div className="section-kicker"><span/> A FORECAST THAT FEELS PERSONAL</div><h2>Start with your<br/><em>corner of the world.</em></h2><p>Find the forecast for where you are, or search a city you have in mind.</p><div className="welcome-actions"><button className="location-button primary-location" onClick={useMyLocation} disabled={geoLoading}>{geoLoading?<LoaderCircle size={16} className="spin"/>:<LocateFixed size={16}/>} {geoLoading?'Finding your location':'Use my location'}</button><span>or search a place above</span></div></div><div className="welcome-coordinates"><Compass size={14}/> LOCAL WEATHER, NO GUESSWORK</div></section>:status==='loading'&&!forecast?<section className="loading-card"><LoaderCircle className="spin" size={24}/><span>Finding the forecast for {place.name}…</span></section>:forecast&&current?<>
        <section className="current-grid"><article className="current-card"><div className="current-card-top"><div><div className="current-place"><MapPin size={14}/>{place.isCurrentLocation?'YOUR CURRENT LOCATION':locationLine(place).toUpperCase()}</div><div className="current-summary">{weatherLabel(current.weather_code,current.is_day)}</div></div><div className="sun-art"><div className="sun-halo"/><WeatherGlyph code={current.weather_code} isDay={current.is_day} size={52}/></div></div><div className="current-reading"><span>{temp(current.temperature_2m)}°</span><div><b>Feels like {temp(current.apparent_temperature)}°</b><small>H {temp(Math.max(...forecast.daily.temperature_2m_max))}° <i/> L {temp(Math.min(...forecast.daily.temperature_2m_min))}°</small></div></div><div className="current-card-foot"><span><span className="live-dot"/> LIVE CONDITIONS</span><span>Updated {formatClock(current.time)}</span></div><div className="current-decoration decoration-a"/><div className="current-decoration decoration-b"/></article>
          <article className="hourly-card"><div className="card-heading"><div><div className="section-kicker"><span/> THE NEXT FEW HOURS</div><h2>Hourly outlook</h2></div><span className="mini-day">TODAY</span></div><div className="hourly-scroll">{hourly.map((item,i)=><div className={`hour-item ${i===0?'hour-now':''}`} key={item.time}><span className="hour-time">{i===0?'Now':formatClock(item.time)}</span><WeatherGlyph code={item.code} isDay={item.isDay} size={21}/><b>{temp(item.temp)}°</b><small>{item.rain>0?<><Droplets size={11}/>{item.rain}%</>:'—'}</small></div>)}</div><div className="hourly-axis"><span>NOW</span><span>6 HOURS</span><span>12 HOURS</span></div></article></section>
        <section className="forecast-layout"><article className="week-card"><div className="card-heading"><div><div className="section-kicker"><span/> PLAN AHEAD</div><h2>7-day forecast</h2></div><span className="week-location"><MapPin size={13}/>{place.name}</span></div><div className="week-list">{forecast.daily.time.map((day,i)=><div className="week-row" key={day}><span className="week-day">{formatDay(day,i)}</span><span className="week-weather"><WeatherGlyph code={forecast.daily.weather_code[i]} size={18}/><span>{weatherLabel(forecast.daily.weather_code[i])}</span></span><span className="week-rain">{forecast.daily.precipitation_probability_max[i]>0&&<><Droplets size={12}/>{forecast.daily.precipitation_probability_max[i]}%</>}</span><div className="temp-range"><span>{temp(forecast.daily.temperature_2m_min[i])}°</span><div className="range-track"><i style={{left:`${Math.max(0,Math.min(65,(forecast.daily.temperature_2m_min[i]+10)*2))}%`,width:`${Math.max(22,Math.min(72,(forecast.daily.temperature_2m_max[i]-forecast.daily.temperature_2m_min[i])*2.5))}%`}}/></div><b>{temp(forecast.daily.temperature_2m_max[i])}°</b></div></div>)}</div><div className="week-foot">Forecast from Open-Meteo <span>·</span> Local time {forecast.timezone}</div></article>
          <div className="details-column"><article className="details-card"><div className="card-heading"><div><div className="section-kicker"><span/> RIGHT NOW</div><h2>Weather details</h2></div></div><div className="detail-grid"><Detail icon={<Thermometer size={16}/>} label="FEELS LIKE" value={`${temp(current.apparent_temperature)}°`} note={current.apparent_temperature<current.temperature_2m?'A little cooler outside':'Close to the air temperature'}/><Detail icon={<Droplets size={16}/>} label="HUMIDITY" value={`${current.relative_humidity_2m}%`} note={current.relative_humidity_2m>65?'Feeling a bit humid':'Comfortable in the shade'}/><Detail icon={<Wind size={16}/>} label="WIND" value={`${wind(current.wind_speed_10m)} ${windLabel}`} note={`${windDirection(current.wind_direction_10m)} breeze`}/><Detail icon={<Sun size={16}/>} label="UV INDEX" value={current.uv_index.toFixed(0)} note={uvNote(current.uv_index)}/></div></article><article className="sun-card"><div className="sun-card-top"><div><div className="section-kicker"><span/> DAYLIGHT</div><h2>Sunrise & sunset</h2></div><Sunrise size={18}/></div><div className="sun-times"><div><Sunrise size={16}/><span>Sunrise</span><b>{formatClock(forecast.daily.sunrise[0])}</b></div><div><Sunset size={16}/><span>Sunset</span><b>{formatClock(forecast.daily.sunset[0])}</b></div></div><div className="sun-path"><div className="sun-path-line"/><div className="sun-progress" style={{left:`${dayProgress(forecast.daily.sunrise[0],forecast.daily.sunset[0])}%`}}><Sun size={17}/></div></div><div className="daylight-caption"><span>FIRST LIGHT</span><span>{dayLength(forecast.daily.sunrise[0],forecast.daily.sunset[0])} OF DAYLIGHT</span><span>LAST LIGHT</span></div></article></div>
        </section></>:null}
      <footer className="weather-footer"><span><span className="brand-sun tiny"><Sun size={13}/></span> DAYLIGHT WEATHER</span><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather data by Open-Meteo ↗</a><span>Location is only used to find your local forecast.</span></footer>
    </main>
  </div>
}

function Detail({icon,label,value,note}:{icon:ReactNode;label:string;value:string;note:string}){return <div className="detail-item"><div className="detail-top">{icon}<span>{label}</span></div><b>{value}</b><small>{note}</small></div>}
function windDirection(degrees:number){return['N','NE','E','SE','S','SW','W','NW'][Math.round(degrees/45)%8]}
function uvNote(value:number){return value<3?'Low exposure':value<6?'Moderate exposure':value<8?'High exposure':value<11?'Very high exposure':'Extreme exposure'}
function dayProgress(sunrise:string,sunset:string){const now=new Date();const [sh,sm]=sunrise.split('T')[1].split(':').map(Number);const [eh,em]=sunset.split('T')[1].split(':').map(Number);const start=sh*60+sm,end=eh*60+em,minute=now.getHours()*60+now.getMinutes();return Math.max(0,Math.min(100,((minute-start)/(end-start))*100))}
function dayLength(sunrise:string,sunset:string){const start=new Date(sunrise).getTime(),end=new Date(sunset).getTime();if(!Number.isFinite(start)||!Number.isFinite(end))return'—';const minutes=Math.round((end-start)/60000);return`${Math.floor(minutes/60)}h ${minutes%60}m`}
