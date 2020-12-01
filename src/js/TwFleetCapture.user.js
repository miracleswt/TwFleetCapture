// ==UserScript==
// @name            TwFleetCapture
// @name:ja         フリートキャプチャー
// @namespace       https://furyutei.work
// @license         MIT
// @version         0.1.0
// @description     Save Twitter Fleet Images/Videos
// @description:ja  Twitterのフリート画像／動画を保存
// @author          furyu
// @match           https://twitter.com/*
// @require         https://cdnjs.cloudflare.com/ajax/libs/jszip/3.5.0/jszip.min.js
// @grant           none
// @compatible      chrome
// @compatible      firefox
// @supportURL      https://github.com/furyutei/TwFleetCapture/issues
// @contributionURL https://memo.furyutei.work/about#%E6%B0%97%E3%81%AB%E5%85%A5%E3%81%A3%E3%81%9F%E5%BD%B9%E3%81%AB%E7%AB%8B%E3%81%A3%E3%81%9F%E3%81%AE%E3%81%8A%E6%B0%97%E6%8C%81%E3%81%A1%E3%81%AF%E3%82%AE%E3%83%95%E3%83%88%E5%88%B8%E3%81%A7
// ==/UserScript==

( () => {

const
    SCRIPT_NAME = 'TwFleetCapture',
    DEBUG = true,
    
    self = undefined,
    
    CSS_STYLE_CLASS = SCRIPT_NAME + '-css-rule',
    HOME_CAPTURE_CONTAINER_ID = SCRIPT_NAME + '-home-capture-container',
    USER_CAPTURE_CONTAINER_ID = SCRIPT_NAME + '-user-capture-container',
    
    format_date = ( date, format, is_utc ) => {
        if ( ! format ) {
            format = 'YYYY-MM-DD hh:mm:ss.SSS';
        }
        
        let msec = ( '00' + ( ( is_utc ) ? date.getUTCMilliseconds() : date.getMilliseconds() ) ).slice( -3 ),
            msec_index = 0;
        
        if ( is_utc ) {
            format = format
                .replace( /YYYY/g, date.getUTCFullYear() )
                .replace( /MM/g, ( '0' + ( 1 + date.getUTCMonth() ) ).slice( -2 ) )
                .replace( /DD/g, ( '0' + date.getUTCDate() ).slice( -2 ) )
                .replace( /hh/g, ( '0' + date.getUTCHours() ).slice( -2 ) )
                .replace( /mm/g, ( '0' + date.getUTCMinutes() ).slice( -2 ) )
                .replace( /ss/g, ( '0' + date.getUTCSeconds() ).slice( -2 ) )
                .replace( /S/g, ( all ) => {
                    return msec.charAt( msec_index ++ );
                } );
        }
        else {
            format = format
                .replace( /YYYY/g, date.getFullYear() )
                .replace( /MM/g, ( '0' + ( 1 + date.getMonth() ) ).slice( -2 ) )
                .replace( /DD/g, ( '0' + date.getDate() ).slice( -2 ) )
                .replace( /hh/g, ( '0' + date.getHours() ).slice( -2 ) )
                .replace( /mm/g, ( '0' + date.getMinutes() ).slice( -2 ) )
                .replace( /ss/g, ( '0' + date.getSeconds() ).slice( -2 ) )
                .replace( /S/g, ( all ) => {
                    return msec.charAt( msec_index ++ );
                } );
        }
        
        return format;
    },
    
    get_gmt_datetime = ( time, is_msec ) => {
        let date = new Date( ( is_msec ) ? time : 1000 * time );
        
        return format_date( date, 'YYYY-MM-DD_hh:mm:ss_GMT', true );
    },
    
    get_log_timestamp = () => format_date( new Date() ),
    
    log_debug = ( ... args ) => {
        if ( ! DEBUG ) {
            return;
        }
        console.debug( '%c[' + SCRIPT_NAME + '] ' + get_log_timestamp(), 'color: gray;', ... args );
    },
    
    log = ( ... args ) => {
        console.log( '%c[' + SCRIPT_NAME + '] ' + get_log_timestamp(), 'color: teal;', ... args );
    },
    
    log_info = ( ... args ) => {
        console.info( '%c[' + SCRIPT_NAME + '] ' + get_log_timestamp(), 'color: darkslateblue;', ... args );
    },
    
    log_error = ( ... args ) => {
        console.error( '%c[' + SCRIPT_NAME + '] ' + get_log_timestamp(), 'color: purple;', ... args );
    },
    
    adjust_date_for_zip = ( date ) => {
        if ( ! date ) {
            date = new Date();
        }
        return new Date( date.getTime() - date.getTimezoneOffset() * 60000 );
    },
    
    fetch_api = ( api_url ) => {
        return fetch( api_url, {
                method: 'GET',
                    headers: {
                    'authorization' : 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
                    'x-csrf-token' : document.cookie.match( /ct0=(.*?)(?:;|$)/ )[ 1 ],
                        'x-twitter-active-user' : 'yes',
                        'x-twitter-auth-type' : 'OAuth2Session',
                        'x-twitter-client-language' : 'en',
                    },
                    mode: 'cors',
                    credentials : 'include',
            } )
            .then( response => {
                if ( ! response.ok ) {
                    throw new Error( 'Network response was not ok' );
                }
                return response.json()
            } );
    },
    
    fetch_media = async ( media_url ) => {
        return fetch( media_url )
            .then( response => {
                if ( ! response.ok ) {
                    throw new Error( 'Network response was not ok' );
                }
                return response.blob()
            } )
            .catch( error => {
                log_error( 'fetch_media() media_url=', media_url, error );
                return null;
            } );
    },
    
    fetch_user_info = async ( screen_name, user_id ) => {
        return await fetch_api( 'https://api.twitter.com/1.1/users/show.json?' + ( screen_name ? 'screen_name=' + encodeURIComponent( screen_name ) : 'user_id=' + encodeURIComponent( user_id ) ) )
            .catch( error => {
                log_error( 'fetch_user_info(): screen_name=', screen_name, 'user_id=', user_id, 'error=', error );
                return {
                    error : error,
                };
            } );
    },
    
    fetch_fleetline = async () => {
        return await fetch_api( 'https://api.twitter.com/fleets/v1/fleetline' )
            .catch( error => {
                log_error( 'fetch_fleetline(): error=', error );
                return {
                    error : error,
                };
            } );
    },
    
    fetch_user_fleet = async ( user_id ) => {
        return await fetch_api( 'https://api.twitter.com/fleets/v1/user_fleets?user_id=' + encodeURIComponent( user_id ) )
            .catch( error => {
                log_error( 'fetch_user_fleet(): user_id=', user_id, 'error=', error );
                return {
                    error : error,
                };
            } );
    },
    
    zip_media_files = async ( zip, params ) => {
        let { user_id, user_info, user_fleet_info } = params;
        
        if ( ! user_id ) {
            user_id = user_info.id_str;
        }
        
        let fleet_info_list = ( ( user_fleet_info.fleet_threads || [] )[ 0 ] || {} ).fleets || [];
        
        if ( fleet_info_list.length < 1 ) {
            return fleet_info_list.length;
        }
        
        let base_directory = user_info.screen_name + '.' + user_id + '/';
        
        zip.file( base_directory + 'user.json', JSON.stringify( user_info, null, 4 ), {
            date : adjust_date_for_zip(),
        } );
        
        for ( let fleet_info of fleet_info_list ) {
            let fleet_id = fleet_info.fleet_id,
                created_date = new Date( fleet_info.created_at ),
                base_name = base_directory + format_date( created_date, 'YYYYMMDD_hhmmss' ) + '.' + fleet_id,
                zip_date_info = {
                    date : adjust_date_for_zip( created_date ),
                };
            
            zip.file( base_name + '.json', JSON.stringify( fleet_info, null, 4 ), zip_date_info );
            
            let media_entity = fleet_info.media_entity,
                media_info = media_entity.media_info,
                image_url = media_entity.media_url_https.replace( /\.([^.]+)$/, '?format=$1&name=orig' ),
                image_ext = RegExp.$1,
                image_blob = await fetch_media( image_url );
            
            if ( image_blob ) {
                zip.file( base_name + '.' + image_ext, image_blob, zip_date_info );
            }
            
            if ( media_info.video_info ) {
                let max_size_variant = media_info.video_info.variants.reduce( ( max_size_variant, variant ) => {
                        if ( variant.content_type != 'video/mp4' ) {
                            return max_size_variant;
                        }
                        return ( max_size_variant.bit_rate < variant.bit_rate ) ? variant : max_size_variant;
                    }, { bit_rate : 0 } ),
                    video_url = max_size_variant.url;
                
                if ( video_url ) {
                    let video_blob = await fetch_media( video_url );
                    
                    if ( video_blob ) {
                        zip.file( base_name + '.mp4', video_blob, zip_date_info );
                    }
                }
            }
        }
        
        return fleet_info_list.length;
    },
    
    download_blob = ( filename, blob ) => {
        let blob_url = URL.createObjectURL( blob ),
            download_button = document.createElement( 'a' );
        
        download_button.href = blob_url;
        download_button.download = filename;
        document.documentElement.appendChild( download_button );
        download_button.click();
        download_button.remove();
    },
    
    download_followee_fleets = async () => {
        let fleetline_info = await fetch_fleetline();
        
        if ( ( fleetline_info.error ) || ( ! fleetline_info.threads ) ) {
            alert( 'Failed to get fleet information: ' + fleetline_info.error );
            return;
        }
        
        let zip = new JSZip(),
            zip_fleet_infos = [];
        
        for ( let thread of fleetline_info.threads ) {
            let user_id = thread.user_id_str,
                user_info = await fetch_user_info( null, user_id );
            
            if ( user_info.error ) {
                continue;
            }
            
            let user_fleet_info = await fetch_user_fleet( user_id );
            
            if ( user_fleet_info.error ) {
                continue;
            }
            
            let params = {
                    user_info,
                    user_fleet_info,
                };
            
            if ( 0 < await zip_media_files( zip, params ) ) {
                zip_fleet_infos.push( params );
            }
        }
        
        if ( zip_fleet_infos.length < 1 ) {
            alert( 'No available fleet found' );
            return;
        }
        
        let zip_blob = await zip.generateAsync( { type : 'blob' } ),
            zip_filename = 'Fleet-home.' + format_date( new Date(), 'YYYYMMDD_hhmmss' ) + '.zip';
        
        download_blob( zip_filename, zip_blob );
    },
    
    download_user_fleets = async ( user_info ) => {
        let user_id = user_info.error ? null : user_info.id_str,
            user_fleet_info = user_id ? await fetch_user_fleet( user_id ) : { error : 'User not found' };
        
        if ( user_fleet_info.error ) {
            alert( 'Failed to get fleet information: ' + user_fleet_info.error );
            return;
        }
        
        let zip = new JSZip(),
            fleet_length = await zip_media_files( zip, {
                user_info,
                user_fleet_info,
            } );
        
        if ( fleet_length < 1 ) {
            alert( 'No available fleet found' );
            return;
        }
        let zip_blob = await zip.generateAsync( { type : 'blob' } ),
            zip_filename = 'Fleet.' + user_info.screen_name + '.' + user_id + '.' + format_date( new Date(), 'YYYYMMDD_hhmmss' ) + '.zip';
        
        download_blob( zip_filename, zip_blob );
    },
    
    check_home_page = () => {
        let capture_container = document.querySelector( '#' + HOME_CAPTURE_CONTAINER_ID );
        
        if ( capture_container ) {
            return;
        }
        
        let header = document.querySelector( '[data-testid="primaryColumn"] h2[role="heading"]' );
        
        if ( ! header ) {
            return;
        }
        
        let header_container = header.parentNode.parentNode.parentNode;
        
        capture_container = document.createElement( 'button' );
        capture_container.id = HOME_CAPTURE_CONTAINER_ID;
        capture_container.textContent = 'Fleets 💾';
        capture_container.title = 'Download Fleets of Followees';
        
        capture_container.addEventListener( 'click', ( event ) => {
            capture_container.classList.add( 'loading' );
            capture_container.disabled = true;
            
            ( async () => {
                await download_followee_fleets();
                capture_container.disabled = false;
                capture_container.classList.remove( 'loading' );
            } )();
        } );
        
        header_container.insertBefore( capture_container, header_container.lastChild );
    },
    
    check_user_page = () => {
        let header_photo_link = document.querySelector( '[data-testid="primaryColumn"] a[role="link"][href$="/header_photo"]~div a[role="link"][href$="/photo"]' );
        
        if ( ! header_photo_link ) {
            return;
        }
        
        let screen_name = ( header_photo_link.href.match( /\/([^/]+)\/photo$/ ) || [] )[ 1 ];
        
        if ( ! screen_name ) {
            return;
        }
        
        let capture_container = document.querySelector( '#' + USER_CAPTURE_CONTAINER_ID );
        
        if ( capture_container ) {
            if ( capture_container.dataset.screen_name == screen_name ) {
                return;
            }
            capture_container.remove();
        }
        
        let user_info;
        
        capture_container = document.createElement( 'button' );
        capture_container.classList.add( 'hidden' );
        capture_container.id = USER_CAPTURE_CONTAINER_ID;
        capture_container.dataset.screen_name = screen_name;
        capture_container.textContent = 'Fleets 💾';
        capture_container.title = 'Download Fleets of this User';
        
        capture_container.addEventListener( 'click', ( event ) => {
            capture_container.classList.add( 'loading' );
            capture_container.disabled = true;
            
            ( async () => {
                await download_user_fleets( user_info );
                capture_container.disabled = false;
                capture_container.classList.remove( 'loading' );
            } )();
        } );
        
        header_photo_link.after( capture_container );
        
        fetch_user_info( screen_name )
        .then( fetched_user_info => {
            user_info = fetched_user_info;
            
            const
                check_valid_fleets = async () => {
                    let user_fleet_info = await fetch_user_fleet( user_info.id_str ),
                        fleet_info_list = ( ( user_fleet_info.fleet_threads || [] )[ 0 ] || {} ).fleets || [];
                    
                    if ( 0 < fleet_info_list.length ) {
                        header_photo_link.style.borderColor = '#1DA1F2';
                        capture_container.classList.remove( 'hidden' );
                    }
                    else {
                        header_photo_link.style.borderColor = 'unset';
                        capture_container.classList.add( 'hidden' );
                    }
                };
            
            ( async () => {
                await check_valid_fleets();
                
                /*
                // TODO: 定期監視は保留（API制限は180回／15分）
                //let timer_id = setInterval( () => {
                //        if ( document.querySelector( '#' + USER_CAPTURE_CONTAINER_ID ) !== capture_container ) {
                //            clearInterval( timer_id );
                //            return;
                //        }
                //        check_valid_fleets();
                //    }, 30*1000 );
                */
            } )();
        } );
    },
    
    check_page = () => {
        let pathname = location.pathname;
        
        if ( /^\/home(?:\/|$)/.test( pathname ) ) {
            check_home_page();
        }
        else {
            check_user_page();
        }
    },
    
    insert_css_rule = () => {
        const
            css_rule_text = `
                #${HOME_CAPTURE_CONTAINER_ID},
                #${USER_CAPTURE_CONTAINER_ID} {
                    padding: 2px 10px;
                    color: #FFFFFF;
                    background-color: #1DA1F2;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                
                #${USER_CAPTURE_CONTAINER_ID} {
                    /*margin-left: -120px;*/
                    position: absolute;
                    top: 30px;
                    left: 140px;
                }
                
                #${HOME_CAPTURE_CONTAINER_ID}.loading,
                #${USER_CAPTURE_CONTAINER_ID}.loading {
                    opacity: 50%;
                    cursor: wait;
                }
                
                #${HOME_CAPTURE_CONTAINER_ID}.hidden,
                #${USER_CAPTURE_CONTAINER_ID}.hidden {
                    display: none;
                }
        `;
        
        let css_style = document.querySelector( '.' + CSS_STYLE_CLASS );
        
        if ( css_style ) css_style.remove();
        
        css_style = document.createElement( 'style' );
        css_style.classList.add( CSS_STYLE_CLASS );
        css_style.textContent = css_rule_text;
        
        document.querySelector( 'head' ).appendChild( css_style );
    },
    
    observer = new MutationObserver( ( records ) => {
        try {
            stop_observe();
            check_page();
        }
        finally {
            start_observe();
        }
    } ),
    start_observe = () => observer.observe( document.body, { childList : true, subtree : true } ),
    stop_observe = () => observer.disconnect();

insert_css_rule();
start_observe();
check_page();

} )();
